// T17 — testes de segurança transversais (REQ-CON-13). Unitários: sem banco.
import { Controller, Get, INestApplication, Logger, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ContaDto } from '../src/modules/contas/http/conta.dto';
import { LogMiddleware } from '../src/shared/http/log.middleware';
import { criarValidationPipe } from '../src/shared/http/validacao';

const pipe = criarValidationPipe();
const validar = (corpo: Record<string, unknown>) =>
  pipe.transform(corpo, { type: 'body', metatype: ContaDto }).then(
    (dto) => ({ ok: true as const, dto }),
    (e) => ({ ok: false as const, erros: e.getResponse() as Record<string, string[]> }),
  );
const valido = { name: 'Aluguel', date_due: '2027-01-10', value: 10, done: false, category_id: 5, bank_account_id: 4 };

describe('T17 — corpo de contas (REQ-CON-13)', () => {
  it('corpo válido passa; value vira texto decimal (sem ponto flutuante)', async () => {
    const r = await validar(valido);
    expect(r.ok && r.dto.value).toBe('10');
  });

  it.each([['id', 1], ['client_id', 99], ['created_at', '2020-01-01'], ['statementable_type', 'X']])(
    'mass assignment: "%s" no corpo → 422',
    async (campo, valor) => {
      const r = await validar({ ...valido, [campo]: valor });
      expect(r.ok).toBe(false);
      expect(Object.keys((r as { erros: object }).erros)).toContain(campo);
    },
  );

  it.each([
    ['zero', 0], ['negativo (RN-CON-015)', -10], ['3 casas', 10.123], ['acima do teto', 1_000_000_000],
    ['texto não numérico', 'dez'], ['exponencial em texto', '1e3'], ['NaN', Number.NaN],
  ])('value inválido: %s → 422', async (_n, value) => {
    const r = await validar({ ...valido, value });
    expect(r.ok).toBe(false);
    expect(Object.keys((r as { erros: object }).erros)).toEqual(['value']);
  });

  it('teto do valor aceito: 999999999.99', async () => {
    expect((await validar({ ...valido, value: '999999999.99' })).ok).toBe(true);
  });

  it('repeat_number > 120 → 422 (DoS por repetição — revisão #7)', async () => {
    expect((await validar({ ...valido, repeat: true, repeat_number: 121, repeat_type: 1 })).ok).toBe(false);
    expect((await validar({ ...valido, repeat: true, repeat_number: 120, repeat_type: 1 })).ok).toBe(true);
  });

  it('sem category_id / bank_account_id → 422 (corrige RN-CON-013: legado dava 500)', async () => {
    const { category_id: _c, bank_account_id: _b, ...sem } = valido;
    const r = await validar(sem);
    expect(Object.keys((r as { erros: object }).erros).sort()).toEqual(['bank_account_id', 'category_id']);
  });

  it('ids vindos do formulário como texto são aceitos; lixo não', async () => {
    expect((await validar({ ...valido, category_id: '5', bank_account_id: '4' })).ok).toBe(true);
    expect((await validar({ ...valido, bank_account_id: '' })).ok).toBe(false); // valor inicial do SPA
  });
});

@Controller('api/eco-log')
class EcoLogController {
  @Get()
  eco(@Req() _req: unknown) {
    return { ok: true };
  }
}

describe('T17 — log sem segredos (revisão #9)', () => {
  let app: INestApplication;
  const linhas: string[] = [];

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void linhas.push(String(m)));
    const modulo = await Test.createTestingModule({ controllers: [EcoLogController] }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.use((req: never, res: never, next: () => void) => new LogMiddleware().use(req, res, next));
    await app.init();
  });
  afterAll(() => app.close());

  it('não registra Authorization, query string nem corpo', async () => {
    await request(app.getHttpServer())
      .get('/api/eco-log?token=SEGREDO-NA-QUERY&password=SENHA')
      .set('Authorization', 'Bearer TOKEN-SECRETO')
      .expect(200);
    const log = linhas.join('\n');
    expect(log).toContain('/api/eco-log');
    expect(log).not.toMatch(/TOKEN-SECRETO|SEGREDO-NA-QUERY|SENHA/);
  });
});
