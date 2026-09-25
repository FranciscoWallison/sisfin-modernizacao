// S06 — achados da revisão de segurança do site (docs/revisoes/2026-09-25-security-site.md). Cada hipótese virou um
// teste que falhou antes da correção. Roda com DATABASE_URL.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('segurança do site (S06, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const marca = `seg-${Date.now().toString(36)}`;
  const envAntes = process.env.CADASTROS_POR_HORA;
  const http = () => request(app.getHttpServer());
  const cadastro = (email: string) => ({
    name: `Pessoa ${marca}`, email, password: 'segredo1', password_confirmation: 'segredo1',
    client: { name: `Empresa ${marca}`, email: `empresa-${marca}@x.com` },
  });

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    process.env.CADASTROS_POR_HORA = '3'; // S3: limite próprio do cadastro, baixo para o teste
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

  describe('S1 — e-mail sem diferenciar maiúsculas NÃO pode virar ILIKE (curinga % e _)', () => {
    it.each([['%'], ['%@user.com'], ['cliente_@user.com'], ['CLIENTE_@USER.COM']])('login com "%s" e a senha do seed → 400 (não casa com ninguém)', async (email) => {
      await http().post('/api/access_token').send({ email, password: 'secret' }).expect(400);
    });

    it('o login legítimo continua sem diferenciar maiúsculas (RN-SIT-009)', async () => {
      await http().post('/api/access_token').send({ email: 'Cliente1@User.Com', password: 'secret' }).expect(200);
    });

    it('cadastro: "a_b" não colide com "axb" (o _ não é curinga)', async () => {
      const cadastrado = await base.user.create({
        data: { name: `Pessoa ${marca}`, email: `axb-${marca}@x.com`, password: 'x', role: 'client', clientId: null },
      });
      expect(cadastrado.id).toBeGreaterThan(0);
      await http().post('/api/register').send(cadastro(`a_b-${marca}@x.com`)).expect(201);
    });
  });

  describe('S2/S6 — e-mail do login validado (tamanho e NUL)', () => {
    it('e-mail de 300 caracteres → 422 (não vira entrada eterna no mapa de tentativas)', async () => {
      await http().post('/api/access_token').send({ email: `${'a'.repeat(290)}@x.com`, password: 'x' }).expect(422);
    });
    it('e-mail com \\u0000 → 422 (não 500 do Postgres)', async () => {
      await http().post('/api/access_token').send({ email: 'a\u0000@x.com', password: 'x' }).expect(422);
    });
  });

  // por último: gasta o balde de cadastros deste IP
  it('S3 — cadastro tem limite PRÓPRIO por IP (aqui 3/h): o excedente → 429 com Retry-After', async () => {
    const status: number[] = [];
    for (let i = 0; i < 5; i++) status.push((await http().post('/api/register').send(cadastro(`lim${i}-${marca}@x.com`))).status);
    // o cadastro do teste S1 já consumiu 1 — então 2 passam e o resto é 429
    expect(status).toEqual([201, 201, 429, 429, 429]);
    const r = await http().post('/api/register').send(cadastro(`lim9-${marca}@x.com`));
    expect(r.headers['retry-after']).toBeDefined();
  });
});
