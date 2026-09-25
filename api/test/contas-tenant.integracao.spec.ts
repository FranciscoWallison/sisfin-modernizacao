// T16 — e2e cliente A × cliente B PELAS ROTAS HTTP (design §4(c); achado da revisão de segurança do código).
// App completa (AppModule) contra o Postgres do ETL. Roda quando DATABASE_URL existe.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('isolamento entre clientes pelas rotas HTTP (T16, integração)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const marca = `T16-${Date.now()}`;
  let contaA: number; // conta a pagar do cliente A (cliente1)
  let bancoA: number;
  let categoriaA: number;
  let bancoB: number;
  let categoriaB: number;

  const http = (quem: 'a' | 'b') => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[quem]}`),
    put: (url: string, corpo: object) => request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${tokens[quem]}`).send(corpo),
    post: (url: string, corpo: object) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${tokens[quem]}`).send(corpo),
    del: (url: string) => request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${tokens[quem]}`),
  });

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
    for (const [quem, email] of [['a', 'cliente1@user.com'], ['b', 'cliente3@user.com']] as const) {
      const r = await request(app.getHttpServer()).post('/api/access_token').send({ email, password: 'secret' }).expect(200);
      tokens[quem] = r.body.token;
    }
    bancoA = (await http('a').get('/api/bank_accounts').expect(200)).body.data[0].id;
    categoriaA = (await http('a').get('/api/category_expenses').expect(200)).body.data[0].id;
    bancoB = (await http('b').get('/api/bank_accounts').expect(200)).body.data[0].id;
    categoriaB = (await http('b').get('/api/category_expenses').expect(200)).body.data[0].id;
    const criada = await http('a')
      .post('/api/bill_pays', { name: marca, date_due: new Date().toISOString().slice(0, 10), value: 12.34, done: true, category_id: categoriaA, bank_account_id: bancoA })
      .expect(201);
    contaA = criada.body.data.id;
  });

  afterAll(async () => {
    if (typeof contaA === 'number') await http('a').del(`/api/bill_pays/${contaA}`);
    await app.close();
  });

  it('B não lê, não altera e não exclui a conta de A (404, não 403)', async () => {
    await http('b').get(`/api/bill_pays/${contaA}`).expect(404);
    await http('b').put(`/api/bill_pays/${contaA}`, { name: 'x', date_due: '2027-01-01', value: 1, done: false, category_id: categoriaB, bank_account_id: bancoB }).expect(404);
    await http('b').del(`/api/bill_pays/${contaA}`).expect(404);
    await http('a').get(`/api/bill_pays/${contaA}`).expect(200);
  });

  it('B não usa categoria nem conta bancária de A (422)', async () => {
    const r = await http('b').post('/api/bill_pays', { name: marca, date_due: '2027-01-01', value: 1, done: false, category_id: categoriaA, bank_account_id: bancoA }).expect(422);
    expect(Object.keys(r.body).sort()).toEqual(['bank_account_id', 'category_id']);
  });

  it('a busca de B pelo nome da conta de A não acha nada e bill_data fica zerado', async () => {
    const r = await http('b').get(`/api/bill_pays?search=${marca}`).expect(200);
    expect(r.body.data.bills.data).toEqual([]);
    expect(r.body.data.bill_data).toEqual({ total_paid: 0, total_to_pay: 0, total_expired: 0 });
    const a = await http('a').get(`/api/bill_pays?search=${marca}`).expect(200);
    expect(a.body.data.bill_data.total_paid).toBe(12.34);
  });

  it('total_today de B não inclui a conta de A (que vence hoje)', async () => {
    const antes = (await http('b').get('/api/bill_pays/total_today').expect(200)).body.total;
    const outra = await http('a')
      .post('/api/bill_pays', { name: `${marca}-2`, date_due: new Date().toISOString().slice(0, 10), value: 1000, done: false, category_id: categoriaA, bank_account_id: bancoA })
      .expect(201);
    expect((await http('b').get('/api/bill_pays/total_today').expect(200)).body.total).toBe(antes);
    await http('a').del(`/api/bill_pays/${outra.body.data.id}`).expect(204);
  });

  it('extrato, contas bancárias, lists e categorias de B não trazem nada de A', async () => {
    const ext = await http('b').get('/api/statements?orderBy=id&sortedBy=desc&limit=100').expect(200);
    const contasDeB = new Set((await http('b').get('/api/bank_accounts/lists').expect(200)).body.map((c: { id: number }) => c.id));
    expect(contasDeB.has(bancoA)).toBe(false);
    expect(ext.body.data.statements.data.every((s: { bank_account_id: number }) => contasDeB.has(s.bank_account_id))).toBe(true);
    const categoriasDeB = (await http('b').get('/api/category_expenses').expect(200)).body.data.map((c: { id: number }) => c.id);
    expect(categoriasDeB).not.toContain(categoriaA);
    await http('b').get(`/api/bank_accounts/${bancoA}`).expect(404);
  });

  it('include=bankAccount,category de B só traz as próprias', async () => {
    const r = await http('b').get('/api/bill_pays?include=category,bankAccount&limit=100').expect(200);
    for (const c of r.body.data.bills.data) {
      expect(c.bankAccount.data.id).not.toBe(bancoA);
      expect(c.category.data.id).not.toBe(categoriaA);
    }
  });

  it('revisão do código: orderBy=constructor → 422 (não 500)', async () => {
    await http('a').get('/api/bill_pays?orderBy=constructor').expect(422);
    await http('a').get('/api/bill_pays?orderBy=__proto__').expect(422);
  });
});
