import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/shared/http/health.controller';

describe('GET /health (T01)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('responde 200 com status ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
