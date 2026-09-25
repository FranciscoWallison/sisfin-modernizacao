// E02/E03 — extrato contra o PostgreSQL real, pela pilha HTTP (roda com DATABASE_URL).
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;
const br = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

descrever('extrato no banco (E02/E03, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  let token = '';
  let clienteA = 0;
  let clienteB = 0;
  const marca = `E02-${Date.now().toString(36)}`;
  const extratosCriados: number[] = [];
  const recebimentos: number[] = [];

  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const dados = (r: request.Response) => r.body.data as {
    statements: { data: { id: number; date: string; value: number; bankAccount?: { data: { name: string } } }[]; meta: { pagination: { total: number; per_page: number } } };
    statement_data: { count: number; revenues: { total: number }; expenses: { total: number } };
  };
  const recebida = async (valor: number) => {
    const [conta] = (await get('/api/bank_accounts').expect(200)).body.data;
    const [categoria] = (await get('/api/category_revenues').expect(200)).body.data;
    const r = await request(app.getHttpServer()).post('/api/bill_receives').set('Authorization', `Bearer ${token}`)
      .send({ name: `${marca}-${valor}`, date_due: '2018-09-10', value: valor, done: true, category_id: categoria.id, bank_account_id: conta.id }).expect(201);
    recebimentos.push(r.body.data.id);
    return r.body.data.id as number;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
    token = (await request(app.getHttpServer()).post('/api/access_token').send({ email: 'cliente1@user.com', password: 'secret' }).expect(200)).body.token;
    clienteA = (await base.user.findFirstOrThrow({ where: { email: 'cliente1@user.com' } })).clientId!;
    clienteB = (await base.user.findFirstOrThrow({ where: { email: 'cliente3@user.com' } })).clientId!;
  });

  afterAll(async () => {
    if (extratosCriados.length) await base.statement.deleteMany({ where: { id: { in: extratosCriados } } });
    for (const id of recebimentos) await request(app.getHttpServer()).delete(`/api/bill_receives/${id}`).set('Authorization', `Bearer ${token}`);
    await app.close();
    await base.$disconnect();
  });

  it('o período da tela filtra lista E totais pela data do lançamento (REQ-EXT-03)', async () => {
    await recebida(7.77);
    const hoje = new Date();
    const doMes = dados(await get(`/api/statements?search=${encodeURIComponent(`01/${br(hoje).slice(3)} - ${br(hoje)}`)}`).expect(200));
    const tudo = dados(await get('/api/statements').expect(200));
    const noDB = await base.statement.count({ where: { clientId: clienteA, createdAt: { gte: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)) } } });
    expect(doMes.statements.meta.pagination.total).toBe(noDB);
    expect(doMes.statement_data.count).toBe(noDB);
    const vazio = dados(await get(`/api/statements?search=${encodeURIComponent('01/01/2000 - 02/01/2000')}`).expect(200));
    expect([vazio.statements.meta.pagination.total, vazio.statement_data.count, vazio.statement_data.revenues.total, vazio.statement_data.expenses.total]).toEqual([0, 0, 0, 0]);
    // busca sem período: sem efeito (como o legado)
    expect(dados(await get('/api/statements?search=mercado').expect(200)).statement_data).toEqual(tudo.statement_data);
  });

  it.each([
    ['date', 'desc', [{ createdAt: 'desc' as const }, { id: 'asc' as const }]],
    ['bank_accounts:bank_account_id|bank_accounts.name', 'asc', [{ bankAccount: { name: 'asc' as const } }, { id: 'asc' as const }]],
    ['value', 'desc', [{ value: 'desc' as const }, { id: 'asc' as const }]],
  ])('orderBy=%s %s → a mesma ordem que o Postgres dá, com desempate por id (REQ-EXT-05)', async (orderBy, sortedBy, ordem) => {
    const api = dados(await get(`/api/statements?orderBy=${encodeURIComponent(orderBy)}&sortedBy=${sortedBy}&include=bankAccount`).expect(200));
    const esperado = await base.statement.findMany({ where: { clientId: clienteA }, orderBy: ordem, take: 15, select: { id: true } });
    expect(api.statements.data.map((s) => s.id)).toEqual(esperado.map((s) => s.id));
  });

  it('a ordenação não altera os totais (no legado, o join quebrava a consulta dos totais)', async () => {
    const porId = dados(await get('/api/statements').expect(200)).statement_data;
    const porConta = dados(await get(`/api/statements?orderBy=${encodeURIComponent('bank_accounts:bank_account_id|bank_accounts.name')}`).expect(200)).statement_data;
    expect(porConta).toEqual(porId);
  });

  // Revisão de segurança do extrato (X1/X2): datas extremas no período não podem virar 500 — nem aqui nem em contas,
  // que usam o mesmo parser (shared/dominio/periodo).
  it.each([
    ['01/12/9999 - 31/12/9999'], ['01/01/0000 - 31/01/0000'], ['01/01/0001 - 31/12/9999'],
  ])('search=%s → 200 no extrato e nas contas, nunca 500', async (periodo) => {
    await get(`/api/statements?search=${encodeURIComponent(periodo)}`).expect(200);
    await get(`/api/bill_pays?search=${encodeURIComponent(periodo)}`).expect(200);
  });

  it('?limit é ignorado: 15 por página (REQ-EXT-04)', async () => {
    expect(dados(await get('/api/statements?limit=3').expect(200)).statements.meta.pagination.per_page).toBe(15);
  });

  it('lançamento de A apontando para conta bancária de B (dado legado) NÃO aparece nem soma (defesa em profundidade)', async () => {
    const antes = dados(await get('/api/statements').expect(200)).statement_data;
    const contaB = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteB } });
    const s = await base.statement.create({
      data: { value: '999.99', balance: '999.99', bankAccountId: contaB.id, statementableId: 1, statementableType: 'BillReceive', clientId: clienteA, createdAt: new Date(), updatedAt: new Date() } as never,
    });
    extratosCriados.push(s.id);
    const depois = dados(await get('/api/statements?orderBy=id&sortedBy=desc&include=bankAccount').expect(200));
    expect(depois.statements.data.map((x) => x.id)).not.toContain(s.id);
    expect(depois.statement_data).toEqual(antes);
  });

  // No sistema novo, excluir conta paga ESTORNA (ADR-003, REQ-CON-09): o lançamento original fica (histórico) e nasce
  // o de estorno — os dois se anulam nos totais. (No legado não havia estorno: o original ficava sozinho, RN-CON-010.)
  it('conta paga excluída: o lançamento original continua listado; o estorno entra e zera o efeito (REQ-EXT-06 + ADR-003)', async () => {
    const id = await recebida(3.21);
    const lancamento = await base.statement.findFirstOrThrow({ where: { statementableId: id, statementableType: 'BillReceive' }, orderBy: { id: 'desc' } });
    const antes = dados(await get('/api/statements').expect(200)).statement_data;
    await request(app.getHttpServer()).delete(`/api/bill_receives/${id}`).set('Authorization', `Bearer ${token}`).expect(204);
    recebimentos.splice(recebimentos.indexOf(id), 1);
    const depois = dados(await get('/api/statements?orderBy=id&sortedBy=desc').expect(200));
    expect(depois.statements.data.map((x) => x.id)).toContain(lancamento.id);
    expect(depois.statement_data.count).toBe(antes.count + 1);
    expect(Math.round((depois.statement_data.revenues.total - antes.revenues.total) * 100) / 100).toBe(-3.21);
  });
});
