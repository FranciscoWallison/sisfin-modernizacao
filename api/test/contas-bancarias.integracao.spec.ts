// B04 — escrita de contas bancárias contra o PostgreSQL real, pela pilha HTTP (roda com DATABASE_URL).
// Verifica no banco: troca atômica da padrão (também sob concorrência), índice único parcial, isolamento por linha,
// exclusão bloqueada por lançamento e balance do corpo ignorado.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('contas bancárias no banco (B04, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' };
  let clienteA = 0;
  let padraoOriginalDeA: number[] = [];
  const marca = `B04-${Date.now().toString(36)}`;
  const criadas: number[] = [];
  const contasAPagar: number[] = [];

  const http = () => request(app.getHttpServer());
  const como = (quem: 'a' | 'b', metodo: 'get' | 'post' | 'put' | 'delete', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${tokens[quem]}`);
  const corpo = (nome: string, extra: Record<string, unknown> = {}) => ({ name: `${marca}-${nome}`, agency: '1', account: '2', bank_id: 1, ...extra });
  const criar = async (nome: string, extra: Record<string, unknown> = {}) => {
    const r = await como('a', 'post', '/api/bank_accounts').send(corpo(nome, extra)).expect(201);
    criadas.push(r.body.data.id);
    return r.body.data.id as number;
  };
  const padroesDe = async (clientId: number) =>
    (await base.bankAccount.findMany({ where: { clientId, default: true }, orderBy: { id: 'asc' } })).map((c) => c.id);

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
    for (const [quem, email] of [['a', 'cliente1@user.com'], ['b', 'cliente3@user.com']] as const) {
      tokens[quem] = (await http().post('/api/access_token').send({ email, password: 'secret' }).expect(200)).body.token;
    }
    clienteA = (await base.user.findFirstOrThrow({ where: { email: 'cliente1@user.com' } })).clientId!;
    padraoOriginalDeA = await padroesDe(clienteA);
  });

  afterAll(async () => {
    for (const id of contasAPagar) await como('a', 'delete', `/api/bill_pays/${id}`);
    // limpeza só com ids definidos (lição da T07); o estado de "padrão" do cliente A volta a ser o original
    if (criadas.length) await base.bankAccount.deleteMany({ where: { id: { in: criadas } } });
    if (padraoOriginalDeA.length) await base.bankAccount.updateMany({ where: { id: { in: padraoOriginalDeA } }, data: { default: true } });
    await app.close();
    await base.$disconnect();
  });

  it('criar com default=true desmarca a anterior; desmarcar deixa nenhuma; outro cliente intocado (REQ-CBA-02)', async () => {
    const padroesDeOutros = await base.bankAccount.findMany({ where: { clientId: { not: clienteA }, default: true }, orderBy: { id: 'asc' } });
    const c1 = await criar('P1', { default: true });
    expect(await padroesDe(clienteA)).toEqual([c1]);
    const c2 = await criar('P2', { default: true });
    expect(await padroesDe(clienteA)).toEqual([c2]);
    await como('a', 'put', `/api/bank_accounts/${c2}`).send(corpo('P2', { default: false })).expect(200);
    expect(await padroesDe(clienteA)).toEqual([]);
    await como('a', 'put', `/api/bank_accounts/${c1}`).send(corpo('P1', { default: true })).expect(200);
    expect(await padroesDe(clienteA)).toEqual([c1]);
    expect(await base.bankAccount.findMany({ where: { clientId: { not: clienteA }, default: true }, orderBy: { id: 'asc' } })).toEqual(padroesDeOutros);
  });

  it('6 criações SIMULTÂNEAS com default=true → todas 201 e exatamente UMA padrão (advisory lock + troca atômica)', async () => {
    // Cliente SEM padrão: não há linha para o FOR UPDATE travar — só o advisory lock serializa (mutação: sem ele, 409)
    await base.bankAccount.updateMany({ where: { clientId: clienteA, default: true }, data: { default: false } });
    const respostas = await Promise.all(
      Array.from({ length: 6 }, (_, i) => como('a', 'post', '/api/bank_accounts').send(corpo(`C${i}`, { default: true }))),
    );
    respostas.forEach((r) => r.status === 201 && criadas.push(r.body.data.id));
    expect(respostas.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(await padroesDe(clienteA)).toHaveLength(1);
  });

  it('o banco recusa duas padrão no mesmo cliente (índice único parcial — rede de segurança)', async () => {
    const [atual] = await padroesDe(clienteA);
    const outra = await criar('IDX');
    await expect(base.bankAccount.update({ where: { id: outra }, data: { default: true } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await padroesDe(clienteA)).toEqual([atual]);
  });

  it('B edita/exclui conta de A → 404 e a linha fica IDÊNTICA; bancos iguais para os dois (REQ-CBA-06/07)', async () => {
    const c = await criar('VITIMA');
    const antes = await base.bankAccount.findUniqueOrThrow({ where: { id: c } });
    await como('b', 'put', `/api/bank_accounts/${c}`).send(corpo('INVADIDA', { default: true })).expect(404);
    await como('b', 'delete', `/api/bank_accounts/${c}`).expect(404);
    expect(await base.bankAccount.findUniqueOrThrow({ where: { id: c } })).toEqual(antes);
    const [ba, bb] = await Promise.all([como('a', 'get', '/api/banks').expect(200), como('b', 'get', '/api/banks').expect(200)]);
    expect(ba.body).toEqual(bb.body);
  });

  it('balance do corpo é ignorado ao criar e ao editar (REQ-CBA-03)', async () => {
    const c = await criar('SALDO', { balance: 1_000_000 });
    expect((await base.bankAccount.findUniqueOrThrow({ where: { id: c } })).balance.toFixed(2)).toBe('0.00');
    await como('a', 'put', `/api/bank_accounts/${c}`).send(corpo('SALDO', { balance: 555, id: 999999 })).expect(200);
    expect((await base.bankAccount.findUniqueOrThrow({ where: { id: c } })).balance.toFixed(2)).toBe('0.00');
  });

  it('conta com lançamento: 422 e nada apagado; vazia: 204 (REQ-CBA-05)', async () => {
    const c = await criar('DEL');
    const [categoria] = (await como('a', 'get', '/api/category_expenses').expect(200)).body.data;
    const bill = await como('a', 'post', '/api/bill_pays')
      .send({ name: `${marca}-conta`, date_due: '2018-09-06', value: 1, done: false, category_id: categoria.id, bank_account_id: c }).expect(201);
    contasAPagar.push(bill.body.data.id);
    expect((await como('a', 'delete', `/api/bank_accounts/${c}`).expect(422)).body).toEqual({ message: 'Bank account has entries.' });
    expect(await base.bankAccount.count({ where: { id: c } })).toBe(1);
    const vazia = await criar('VAZIA');
    await como('a', 'delete', `/api/bank_accounts/${vazia}`).expect(204);
    expect(await base.bankAccount.count({ where: { id: vazia } })).toBe(0);
  });

  it('bank_id inexistente → 422 bank_id e nada gravado (REQ-CBA-04)', async () => {
    const antes = await base.bankAccount.count({ where: { clientId: clienteA } });
    const r = await como('a', 'post', '/api/bank_accounts').send(corpo('BANCO', { bank_id: 99999 })).expect(422);
    expect(r.body).toEqual({ bank_id: ['The selected bank id is invalid.'] });
    expect(await base.bankAccount.count({ where: { clientId: clienteA } })).toBe(antes);
  });
});
