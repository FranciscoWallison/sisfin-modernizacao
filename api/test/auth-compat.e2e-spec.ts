// T06 — auth compatível (design §8, RN-AUT-001..003, REQ-CON-13). Repositório de usuários FALSO: não precisa de banco.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AuthCompatModule } from '../src/shared/auth-compat/auth-compat.module';
import { CONFIG } from '../src/shared/auth-compat/contexto';
import { UsuarioAuth, UsuariosRepositorio } from '../src/shared/auth-compat/usuarios.repositorio';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-bytes!!';
// Hash no formato do PHP ($2y$), como vem do legado
const HASH_PHP = bcrypt.hashSync('secret', 4).replace(/^\$2b\$/, '$2y$');

class UsuariosFalsos extends UsuariosRepositorio {
  readonly lista: UsuarioAuth[] = [
    usuario(2, 'cliente1@user.com', 2),
    usuario(3, 'cliente2@user.com', 2),
    usuario(90, 'sem-cliente@x.com', null),
  ];
  async porEmail(email: string) {
    return this.lista.find((u) => u.email === email) ?? null;
  }
  async porId(id: number) {
    return this.lista.find((u) => u.id === id) ?? null;
  }
}

function usuario(id: number, email: string, clientId: number | null): UsuarioAuth {
  const data = new Date('2026-09-25T03:16:12Z');
  return {
    id, name: `Cliente ${id}`, email, password: HASH_PHP, role: 'client', clientId, createdAt: data, updatedAt: data,
    client: clientId ? { id: clientId, name: 'Cliente SA', email: 'c@x.com', code: null, createdAt: data, updatedAt: data } : null,
  };
}

describe('auth compatível (T06)', () => {
  let app: INestApplication;
  let usuarios: UsuariosFalsos;
  const http = () => request(app.getHttpServer());
  const login = (email: string, password = 'secret') => http().post('/api/access_token').send({ email, password });

  beforeEach(async () => {
    usuarios = new UsuariosFalsos();
    const config = lerConfig({ NODE_ENV: 'test', JWT_SECRET: SEGREDO });
    const modulo = await Test.createTestingModule({ imports: [AuthCompatModule] })
      .overrideProvider(CONFIG).useValue(config)
      .overrideProvider(UsuariosRepositorio).useValue(usuarios)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, config);
    await app.init();
  });
  afterEach(() => app.close());

  it('login com hash $2y$ do PHP → 200 { token } HS256, 60 min, claims do legado', async () => {
    const r = await login('cliente1@user.com').expect(200);
    const cabecalho = JSON.parse(Buffer.from(r.body.token.split('.')[0], 'base64url').toString());
    const claims = jwt.verify(r.body.token, SEGREDO) as Record<string, any>;
    expect(cabecalho.alg).toBe('HS256');
    expect(claims.exp - claims.iat).toBe(3600);
    expect(claims.nbf).toBe(claims.iat);
    expect(claims.sub).toBe(2);
    expect(typeof claims.jti).toBe('string');
    expect(claims.user).toEqual({ id: 2, name: 'Cliente 2', email: 'cliente1@user.com' });
    expect(claims.client_id).toBeUndefined(); // cliente vem do banco, nunca do token
  });

  it('campos faltando → 422 no formato do legado', async () => {
    const r = await http().post('/api/access_token').send({}).expect(422);
    expect(r.body).toEqual({ email: ['The email field is required.'], password: ['The password field is required.'] });
  });

  it('RN-AUT-001: 5 erros → 400; 6º → 403; outro e-mail no mesmo IP continua podendo', async () => {
    for (let i = 0; i < 5; i++) {
      await login('cliente1@user.com', 'errada').expect(400, { message: 'These credentials do not match our records.' });
    }
    await login('cliente1@user.com', 'errada').expect(403, { message: 'Too many login attempts. Please try again in 60 seconds.' });
    await login('cliente1@user.com').expect(403); // bloqueado mesmo com a senha certa
    await login('cliente2@user.com').expect(200);
  });

  it('RN-CON-019: usuário sem cliente não loga (400, mesma mensagem)', async () => {
    await login('sem-cliente@x.com').expect(400, { message: 'These credentials do not match our records.' });
  });

  it('RN-AUT-003: /api/user → 200; logout → 204; mesmo token depois → 401', async () => {
    const { token } = (await login('cliente1@user.com')).body;
    const u = await http().get('/api/user').set('Authorization', `Bearer ${token}`).expect(200);
    expect(u.body).toMatchObject({ id: 2, email: 'cliente1@user.com', client_id: 2, created_at: '2026-09-25 03:16:12' });
    expect(u.body.password).toBeUndefined();
    await http().post('/api/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await http().get('/api/user').set('Authorization', `Bearer ${token}`).expect(401, { error: 'Unauthenticated.' });
  });

  describe('tokens rejeitados → 401', () => {
    const agora = () => Math.floor(Date.now() / 1000);
    const claims = (extra = {}) => ({ sub: 2, jti: 'x', iat: agora(), nbf: agora(), exp: agora() + 3600, ...extra });
    const casos: Array<[string, () => string]> = [
      ['sem token', () => ''],
      ['alg none', () => jwt.sign(claims(), '', { algorithm: 'none' })],
      ['HS512 (algoritmo diferente)', () => jwt.sign(claims(), SEGREDO, { algorithm: 'HS512' })],
      ['segredo de outro sistema (ex.: o legado)', () => jwt.sign(claims(), 'x'.repeat(40))],
      ['expirado', () => jwt.sign(claims({ iat: agora() - 7200, nbf: agora() - 7200, exp: agora() - 3600 }), SEGREDO)],
      ['sem jti', () => jwt.sign({ sub: 2, iat: agora(), nbf: agora(), exp: agora() + 60 }, SEGREDO)],
      ['usuário apagado', () => jwt.sign(claims({ sub: 999 }), SEGREDO)],
    ];
    it.each(casos)('%s', async (_nome, gerar) => {
      const token = gerar();
      const req = http().get('/api/user');
      if (token) req.set('Authorization', `Bearer ${token}`);
      await req.expect(401);
    });
  });

  it('RN-AUT-002: 60 req/min com X-RateLimit-*; a 61ª → 429 com Retry-After', async () => {
    const { token } = (await login('cliente2@user.com')).body; // o login conta no limite do IP, não do usuário
    let ultima;
    for (let i = 1; i <= 60; i++) ultima = await http().get('/api/user').set('Authorization', `Bearer ${token}`);
    expect(ultima!.status).toBe(200);
    expect(ultima!.headers['x-ratelimit-limit']).toBe('60');
    expect(ultima!.headers['x-ratelimit-remaining']).toBe('0');
    const estourou = await http().get('/api/user').set('Authorization', `Bearer ${token}`).expect(429);
    expect(Number(estourou.headers['retry-after'])).toBeGreaterThan(0);
  });
});
