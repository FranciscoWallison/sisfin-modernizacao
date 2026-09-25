// G06/B07 — achados da revisão de segurança que precisam do banco e da pilha HTTP (roda com DATABASE_URL).
// Cada hipótese virou teste que falhou antes da correção (docs/revisoes/2026-09-25-security-categorias-contas-bancarias.md).
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { CHAVES_ADVISORY_LOCK } from '../src/shared/prisma/chaves-lock';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('segurança dos cadastros (G06/B07, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' };
  let clienteA = 0;
  let clienteB = 0;
  const marca = `SEG-${Date.now().toString(36)}`;
  const limpar = { categorias: [] as number[], contas: [] as number[], contasBancarias: [] as number[] };

  const http = () => request(app.getHttpServer());
  const como = (quem: 'a' | 'b', metodo: 'get' | 'post' | 'put' | 'delete', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${tokens[quem]}`);

  /** Segura o advisory lock (chave, cliente) numa conexão à parte por `ms` milissegundos. */
  const segurarLock = (chave: number, cliente: number, ms: number) =>
    base.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${chave}::int, ${cliente}::int)`;
      await tx.$queryRaw`SELECT pg_sleep(${ms / 1000}::float8)::text`;
    }, { timeout: ms + 5_000 });

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
    clienteB = (await base.user.findFirstOrThrow({ where: { email: 'cliente3@user.com' } })).clientId!;
  }, 30_000);

  afterAll(async () => {
    if (limpar.contas.length) await base.billPay.deleteMany({ where: { id: { in: limpar.contas } } });
    if (limpar.categorias.length) await base.categoryExpense.deleteMany({ where: { id: { in: limpar.categorias } } });
    if (limpar.contasBancarias.length) await base.bankAccount.deleteMany({ where: { id: { in: limpar.contasBancarias } } });
    await app.close();
    await base.$disconnect();
  });

  describe('S2 — fila de lock com limite de espera (um cliente não prende conexões indefinidamente)', () => {
    it('árvore travada por outra transação → 409 em ~3 s, não espera sem fim', async () => {
      const segurando = segurarLock(CHAVES_ADVISORY_LOCK.arvoreDeDespesas, clienteA, 6_000);
      await new Promise((ok) => setTimeout(ok, 300));
      const inicio = Date.now();
      const r = await como('a', 'post', '/api/category_expenses').send({ name: `${marca}-espera` });
      if (r.status === 201) limpar.categorias.push(r.body.data.id);
      expect(r.status).toBe(409);
      expect(Date.now() - inicio).toBeLessThan(5_000);
      await segurando;
    }, 20_000);

    it('troca de conta padrão travada → 409 em ~3 s', async () => {
      const segurando = segurarLock(CHAVES_ADVISORY_LOCK.contaPadrao, clienteA, 6_000);
      await new Promise((ok) => setTimeout(ok, 300));
      const r = await como('a', 'post', '/api/bank_accounts').send({ name: `${marca}-cb`, agency: '1', account: '2', bank_id: 1, default: true });
      if (r.status === 201) limpar.contasBancarias.push(r.body.data.id);
      expect(r.status).toBe(409);
      await segurando;
    }, 20_000);
  });

  describe('S3 — ids fora do int4 → 404/422, nunca 500', () => {
    it.each([
      ['put', '/api/bank_accounts/2147483648'],
      ['delete', '/api/bank_accounts/2147483648'],
      ['get', '/api/bank_accounts/99999999999'],
      ['get', '/api/category_expenses/99999999999'],
      ['delete', '/api/category_expenses/2147483648'],
    ] as const)('%s %s → 404', async (metodo, url) => {
      const corpo = { name: 'x', agency: '1', account: '2', bank_id: 1 };
      await (metodo === 'put' ? como('a', metodo, url).send(corpo) : como('a', metodo, url)).expect(404);
    });

    it('bank_id 2147483648 → 422 bank_id', async () => {
      const r = await como('a', 'post', '/api/bank_accounts').send({ name: 'x', agency: '1', account: '2', bank_id: 2147483648 }).expect(422);
      expect(r.body).toEqual({ bank_id: ['The selected bank id is invalid.'] });
    });
  });

  it('S4 — nome com \\u0000 → 422 (não 500 do Postgres)', async () => {
    await como('a', 'post', '/api/category_expenses').send({ name: 'a\u0000b' }).expect(422);
    await como('a', 'post', '/api/bank_accounts').send({ name: 'a\u0000b', agency: '1', account: '2', bank_id: 1 }).expect(422);
  });

  it('S5 — corpo aninhado 20.000 níveis → 422 em QUALQUER rota com corpo (inclusive o login)', async () => {
    // JSON já em texto (o superagent não serializa 20k níveis — é o que um atacante mandaria cru); arrays: 40 KB,
    // abaixo do limite de 100 KB do body-parser
    const lixo = '['.repeat(20_000) + ']'.repeat(20_000);
    const login = `{"email":"cliente1@user.com","password":"secret","lixo":${lixo}}`;
    const r1 = await http().post('/api/access_token').set('Content-Type', 'application/json').send(login);
    const r2 = await como('a', 'post', '/api/bill_pays').set('Content-Type', 'application/json').send(`{"lixo":${lixo}}`);
    expect([r1.status, r2.status]).toEqual([422, 422]);
  });

  it('S11 — corpo acima de 100 KB → 413 (o filtro transformava o erro do body-parser em 500)', async () => {
    const grande = JSON.stringify({ name: 'x'.repeat(120_000) });
    const r = await como('a', 'post', '/api/category_expenses').set('Content-Type', 'application/json').send(grande);
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ message: 'Payload Too Large' });
  });

  describe('S7 — conta de OUTRO cliente apontando para categoria / conta bancária de A (dado legado)', () => {
    it('A exclui a categoria → 422 e nada muda (FK RESTRICT + P2003), nem de A nem de B', async () => {
      const categoria = (await como('a', 'post', '/api/category_expenses').send({ name: `${marca}-alvo` }).expect(201)).body.data.id;
      limpar.categorias.push(categoria);
      const contaB = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteB } });
      const bill = await base.billPay.create({
        data: { name: `${marca}-B`, dateDue: new Date('2018-09-07T00:00:00Z'), value: '1.00', done: false, clientId: clienteB, categoryId: categoria, bankAccountId: contaB.id },
      });
      limpar.contas.push(bill.id);
      expect((await como('a', 'delete', `/api/category_expenses/${categoria}`).expect(422)).body).toEqual({ message: 'Category has bills.' });
      expect(await base.categoryExpense.count({ where: { id: categoria } })).toBe(1);
      expect(await base.billPay.count({ where: { id: bill.id } })).toBe(1);
    });

    it('A exclui a conta bancária → 422 e nada muda', async () => {
      const cb = (await como('a', 'post', '/api/bank_accounts').send({ name: `${marca}-cb-alvo`, agency: '1', account: '2', bank_id: 1 }).expect(201)).body.data.id;
      limpar.contasBancarias.push(cb);
      const catB = await base.categoryExpense.findFirstOrThrow({ where: { clientId: clienteB } });
      const bill = await base.billPay.create({
        data: { name: `${marca}-B2`, dateDue: new Date('2018-09-07T00:00:00Z'), value: '1.00', done: false, clientId: clienteB, categoryId: catB.id, bankAccountId: cb },
      });
      limpar.contas.push(bill.id);
      expect((await como('a', 'delete', `/api/bank_accounts/${cb}`).expect(422)).body).toEqual({ message: 'Bank account has entries.' });
      expect(await base.bankAccount.count({ where: { id: cb } })).toBe(1);
      expect(await base.billPay.count({ where: { id: bill.id } })).toBe(1);
    });
  });
});
