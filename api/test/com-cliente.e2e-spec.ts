// T07 — @ComCliente(): cliente vem do banco (pelo sub), usuário sem cliente → 403, contexto disponível no handler.
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AuthCompatModule } from '../src/shared/auth-compat/auth-compat.module';
import { CONFIG } from '../src/shared/auth-compat/contexto';
import { UsuarioAuth, UsuariosRepositorio } from '../src/shared/auth-compat/usuarios.repositorio';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { ComCliente, ClienteInterceptor, ClienteObrigatorioGuard } from '../src/shared/tenant/com-cliente';
import { ContextoCliente } from '../src/shared/tenant/contexto-cliente';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-bytes!!';

@Controller('api/eco')
class EcoController {
  @Get()
  @ComCliente()
  async eco() {
    await new Promise((r) => setTimeout(r, 5)); // o contexto sobrevive a await
    return ContextoCliente.atual();
  }
}

const usuario = (id: number, clientId: number | null): UsuarioAuth => ({
  id, name: 'u', email: `u${id}@x.com`, password: bcrypt.hashSync('s', 4), role: 'client', clientId,
  createdAt: null, updatedAt: null, client: null,
});

describe('@ComCliente (T07)', () => {
  let app: INestApplication;
  // Usuário 2 era do cliente 2 quando o token foi emitido e foi movido para o cliente 5 depois
  const usuarios = { porEmail: async () => null, porId: async (id: number) => ({ 2: usuario(2, 5), 90: usuario(90, null) } as any)[id] ?? null };
  const token = (sub: number) => {
    const agora = Math.floor(Date.now() / 1000);
    return jwt.sign({ iss: 'sisfin-api', sub, jti: `j${sub}`, iat: agora, nbf: agora, exp: agora + 60, client_id: 2 }, SEGREDO);
  };

  beforeAll(async () => {
    const config = lerConfig({ NODE_ENV: 'test', JWT_SECRET: SEGREDO });
    const modulo = await Test.createTestingModule({
      imports: [AuthCompatModule],
      controllers: [EcoController],
      providers: [ClienteObrigatorioGuard, ClienteInterceptor],
    })
      .overrideProvider(CONFIG).useValue(config)
      .overrideProvider(UsuariosRepositorio).useValue(usuarios)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, config);
    await app.init();
  });
  afterAll(() => app.close());

  it('cliente vem do BANCO pelo sub — nunca da claim client_id do token', async () => {
    const r = await request(app.getHttpServer()).get('/api/eco').set('Authorization', `Bearer ${token(2)}`).expect(200);
    expect(r.body).toEqual({ clienteId: 5, usuarioId: 2 });
  });

  it('usuário sem cliente → 403 (legado: 500 — RN-CON-019)', async () => {
    await request(app.getHttpServer()).get('/api/eco').set('Authorization', `Bearer ${token(90)}`).expect(403);
  });

  it('sem token → 401', async () => {
    await request(app.getHttpServer()).get('/api/eco').expect(401);
  });
});
