// T05 — formato HTTP compatível com o legado (contrato.md) e sem vazamento de informação (revisão de segurança #9).
import { Body, Controller, Get, INestApplication, NotFoundException, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import request from 'supertest';
import { ConfigInvalidaError, lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { dataCarbon, dataSimples, dinheiro } from '../src/shared/http/serializacao';

class ExemploDto {
  @IsString() @MaxLength(255) name!: string;
  @IsBoolean() done!: boolean;
}

@Controller('exemplo')
class ExemploController {
  @Post() criar(@Body() dto: ExemploDto) {
    return { recebido: dto };
  }
  @Get('nao-existe') naoExiste() {
    throw new NotFoundException();
  }
  @Get('prisma-p2025') p2025() {
    throw Object.assign(new Error('No record found'), { code: 'P2025' });
  }
  @Get('erro-interno') erroInterno() {
    throw new Error('relation "bill_pays" does not exist — SELECT * FROM bill_pays WHERE client_id = 2');
  }
}

const configOk = { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(32), CORS_ORIGINS: 'http://localhost:8081' };

describe('formato HTTP (T05)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ controllers: [ExemploController] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig(configOk));
    await app.init();
  });
  afterAll(() => app.close());

  it('validação → 422 no formato Laravel { campo: [mensagens] }', async () => {
    const r = await request(app.getHttpServer()).post('/exemplo').send({ done: 'sim' }).expect(422);
    expect(Object.keys(r.body).sort()).toEqual(['done', 'name']);
    expect(Array.isArray(r.body.name)).toBe(true);
  });

  it('campo não declarado (mass assignment: id, client_id) → 422', async () => {
    const r = await request(app.getHttpServer())
      .post('/exemplo')
      .send({ name: 'x', done: true, client_id: 99, id: 1 })
      .expect(422);
    expect(Object.keys(r.body).sort()).toEqual(['client_id', 'id']);
  });

  it('corpo válido passa e só com os campos declarados', async () => {
    await request(app.getHttpServer()).post('/exemplo').send({ name: 'x', done: true }).expect(201, { recebido: { name: 'x', done: true } });
  });

  it('404 responde só { message }', async () => {
    await request(app.getHttpServer()).get('/exemplo/nao-existe').expect(404, { message: 'Not Found' });
  });

  it('erro P2025 do Prisma → 404', async () => {
    await request(app.getHttpServer()).get('/exemplo/prisma-p2025').expect(404);
  });

  it('erro interno → 500 genérico com id de correlação, SEM tabela nem SQL', async () => {
    const r = await request(app.getHttpServer()).get('/exemplo/erro-interno').expect(500);
    expect(r.body.message).toBe('Server Error');
    expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(r.body)).not.toMatch(/bill_pays|SELECT|client_id/);
  });

  it('CORS só para origens da allowlist', async () => {
    const permitida = await request(app.getHttpServer()).get('/exemplo/nao-existe').set('Origin', 'http://localhost:8081');
    expect(permitida.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    const outra = await request(app.getHttpServer()).get('/exemplo/nao-existe').set('Origin', 'https://evil.example');
    expect(outra.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// Produção exige o Stripe (ADR-011, REQ-ASS-07) — testado em assinaturas-config.spec; aqui só completa o ambiente
const STRIPE = { PAGAMENTOS: 'stripe', STRIPE_SECRET_KEY: 'sk_live_x1', STRIPE_WEBHOOK_SECRET: 'whsec_x1', STRIPE_PRICE_ID: 'price_x1', SITE_URL: 'https://sisfin.example.com' };

describe('configuração no boot (T05)', () => {
  it('recusa JWT_SECRET ausente ou com menos de 32 bytes', () => {
    expect(() => lerConfig({ JWT_SECRET: 'curto' })).toThrow(ConfigInvalidaError);
    expect(() => lerConfig({})).toThrow(ConfigInvalidaError);
  });
  it('recusa segredo de exemplo/desenvolvimento em produção', () => {
    expect(() => lerConfig({ NODE_ENV: 'production', JWT_SECRET: 'sisfin-api-segredo-local-de-desenvolvimento-nao-usar-em-producao' })).toThrow(/exemplo/);
    expect(lerConfig({ ...STRIPE, NODE_ENV: 'production', JWT_SECRET: 'k3v9$Qz!pX7wL2mN8rT4yB6cH1dF5gJ0s', ASSETS_URL: 'https://sisfin.example.com' }).ambiente).toBe('production');
  });
  it('ASSETS_URL (REQ-CBA-07): obrigatória e http(s) em produção; padrão local fora dela; sem barra final', () => {
    const producao = { ...STRIPE, NODE_ENV: 'production', JWT_SECRET: 'k3v9$Qz!pX7wL2mN8rT4yB6cH1dF5gJ0s' };
    expect(() => lerConfig(producao)).toThrow(/ASSETS_URL/);
    expect(() => lerConfig({ ...producao, ASSETS_URL: 'javascript:alert(1)' })).toThrow(/ASSETS_URL/);
    expect(() => lerConfig({ ...producao, ASSETS_URL: 'https://a.com/x?y=1' })).toThrow(/ASSETS_URL/);
    expect(lerConfig({ ...producao, ASSETS_URL: 'https://cdn.example.com/sisfin/' }).urlArquivos).toBe('https://cdn.example.com/sisfin');
    expect(lerConfig(configOk).urlArquivos).toBe('http://localhost:8081');
  });
  it('recusa DEBUG_SQL fora de development', () => {
    expect(() => lerConfig({ ...configOk, NODE_ENV: 'production', DEBUG_SQL: '1' })).toThrow(/DEBUG_SQL/);
    expect(lerConfig({ ...configOk, NODE_ENV: 'development', DEBUG_SQL: '1' }).debugSql).toBe(true);
  });
});

describe('serialização compatível (T05, contrato.md)', () => {
  it('data de auditoria no formato Carbon', () => {
    expect(dataCarbon(new Date('2026-09-24T22:00:27Z'))).toEqual({
      date: '2026-09-24 22:00:27.000000',
      timezone_type: 3,
      timezone: 'UTC',
    });
    expect(dataCarbon(null)).toBeNull();
  });
  it('DATE como "aaaa-mm-dd" e dinheiro como número', () => {
    expect(dataSimples(new Date('2027-01-31T00:00:00Z'))).toBe('2027-01-31');
    expect(dinheiro('10.00')).toBe(10);
    expect(dinheiro({ toString: () => '-1352.50' })).toBe(-1352.5);
    expect(dinheiro(null)).toBeNull();
  });
});
