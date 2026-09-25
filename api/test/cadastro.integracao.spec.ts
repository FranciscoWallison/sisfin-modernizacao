// S02 — POST /api/register contra o PostgreSQL real, pela pilha HTTP (roda com DATABASE_URL).
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('cadastro no banco (S02, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const marca = `s02-${Date.now().toString(36)}`;
  const http = () => request(app.getHttpServer());
  const corpo = (email: string, extra: Record<string, unknown> = {}) => ({
    name: `Pessoa ${marca}`, email, password: 'segredo1', password_confirmation: 'segredo1',
    client: { name: `Empresa ${marca}`, email: `empresa-${marca}@x.com` }, ...extra,
  });

  const envAntes = process.env.CADASTROS_POR_HORA;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    process.env.CADASTROS_POR_HORA = '1000'; // o limite próprio (S3) é testado em site-seguranca.integracao
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
  });

  afterAll(async () => {
    if (envAntes === undefined) delete process.env.CADASTROS_POR_HORA;
    else process.env.CADASTROS_POR_HORA = envAntes;
    const usuarios = await base.user.findMany({ where: { name: `Pessoa ${marca}` }, select: { id: true } });
    if (usuarios.length) await base.user.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
    const clientes = await base.client.findMany({ where: { name: `Empresa ${marca}` }, select: { id: true } });
    if (clientes.length) await base.client.deleteMany({ where: { id: { in: clientes.map((c) => c.id) } } });
    await app.close();
    await base.$disconnect();
  });

  it('cadastro válido → 201 com o JWT; cliente + usuário (bcrypt, role client) no banco (REQ-SIT-01)', async () => {
    const email = `ana-${marca}@x.com`;
    const r = await http().post('/api/register').send(corpo(email)).expect(201);
    expect(Object.keys(r.body)).toEqual(['token']);
    const u = await base.user.findUniqueOrThrow({ where: { email }, include: { client: true } });
    expect(u.role).toBe('client');
    expect(u.password).toMatch(/^\$2[aby]\$10\$/);
    expect(u.client).toMatchObject({ name: `Empresa ${marca}`, email: `empresa-${marca}@x.com` });
    // o token é o mesmo do access_token: serve para /api/user
    const eu = await http().get('/api/user').set('Authorization', `Bearer ${r.body.token}`).expect(200);
    expect(eu.body).toMatchObject({ email, client_id: u.clientId, role: 'client' });
  });

  it('o usuário novo usa a API: listas vazias do seu cliente, nada de outro (REQ-SIT-03)', async () => {
    const r = await http().post('/api/register').send(corpo(`bia-${marca}@x.com`)).expect(201);
    const get = (url: string) => http().get(url).set('Authorization', `Bearer ${r.body.token}`).expect(200);
    expect((await get('/api/bank_accounts')).body.data).toEqual([]);
    expect((await get('/api/category_expenses')).body.data).toEqual([]);
    expect((await get('/api/bill_pays')).body.data.bills.data).toEqual([]);
    expect((await get('/api/statements')).body.data.statement_data.count).toBe(0);
  });

  it.each([['cliente1@user.com'], ['CLIENTE1@USER.COM']])('e-mail já usado (%s — sem diferenciar maiúsculas, RN-SIT-009) → 422 e nada gravado', async (email) => {
    const antes = await base.client.count();
    const r = await http().post('/api/register').send(corpo(email)).expect(422);
    expect(r.body).toEqual({ email: ['The email has already been taken.'] });
    expect(await base.client.count()).toBe(antes);
  });

  it('dois cadastros SIMULTÂNEOS com o mesmo e-mail (capitalização diferente) → um 201, um 422, e nenhum cliente órfão', async () => {
    const email = `dup-${marca}@x.com`;
    const clientesAntes = await base.client.count({ where: { name: `Empresa ${marca}` } });
    const rs = await Promise.all([
      http().post('/api/register').send(corpo(email)),
      http().post('/api/register').send(corpo(email.toUpperCase())),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(rs.find((r) => r.status === 422)!.body).toEqual({ email: ['The email has already been taken.'] });
    // a transação desfez o cliente do perdedor
    expect(await base.client.count({ where: { name: `Empresa ${marca}` } })).toBe(clientesAntes + 1);
  });

  it('login com o e-mail em maiúsculas → 200, como no legado (RN-SIT-009; o novo respondia 400)', async () => {
    await http().post('/api/access_token').send({ email: 'CLIENTE1@USER.COM', password: 'secret' }).expect(200);
  });

  it('JWT por query string não autentica (REQ-SIT-06)', async () => {
    const { token } = (await http().post('/api/access_token').send({ email: 'cliente1@user.com', password: 'secret' }).expect(200)).body;
    await http().get(`/api/user?token=${token}`).expect(401);
  });

  // por último: o limite é por IP e gastaria o balde dos outros testes
  it('rate limit das rotas /api também no cadastro público: estoura com 429 + Retry-After', async () => {
    let ultimo: request.Response | undefined;
    for (let i = 0; i < 70; i++) {
      ultimo = await http().post('/api/register').send({});
      if (ultimo.status === 429) break;
    }
    expect(ultimo!.status).toBe(429);
    expect(ultimo!.headers['retry-after']).toBeDefined();
  });
});
