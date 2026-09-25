// E01 — parâmetros do extrato em função pura: ordenação (REQ-EXT-05) e período (REQ-EXT-03).
import { CHAVE_ORDEM_POR_CONTA, intervaloDoSearch, interpretarOrdem } from '../src/modules/extrato/domain/consulta';
import { interpretarPeriodo } from '../src/shared/dominio/periodo';

describe('interpretarOrdem', () => {
  it('sem orderBy → id asc (a ordem do legado)', () => {
    expect(interpretarOrdem(undefined, undefined)).toEqual({ ordem: { campo: 'id', sentido: 'asc' } });
    expect(interpretarOrdem('', '')).toEqual({ ordem: { campo: 'id', sentido: 'asc' } });
  });

  it.each([
    ['id', 'id'], ['value', 'value'], ['balance', 'balance'], ['bank_account_id', 'bankAccountId'],
    ['date', 'createdAt'], [CHAVE_ORDEM_POR_CONTA, 'nomeDaConta'],
  ])('orderBy=%s → %s (Data e Conta davam 500 no legado)', (chave, campo) => {
    expect(interpretarOrdem(chave, 'desc')).toEqual({ ordem: { campo, sentido: 'desc' } });
  });

  it.each([['nao_existe'], ['constructor'], ['toString'], ['created_at'], [['id', 'value']]])('orderBy=%p → 422', (chave) => {
    expect(interpretarOrdem(chave, 'asc')).toEqual({ erros: { orderBy: ['The selected order by is invalid.'] } });
  });

  it('sortedBy inválido → 422', () => {
    expect(interpretarOrdem('id', 'up')).toEqual({ erros: { sortedBy: ['The selected sorted by is invalid.'] } });
  });
});

describe('intervaloDoSearch', () => {
  it('período da tela → [início 00:00, dia seguinte ao fim 00:00) UTC', () => {
    expect(intervaloDoSearch('01/09/2026 - 30/09/2026')).toEqual({
      desde: new Date('2026-09-01T00:00:00Z'),
      ate: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('fim em 31/12/9999 não passa do ano 9999 (X1: o dia seguinte seria o ano 10000 → 500 no banco)', () => {
    expect(intervaloDoSearch('01/12/9999 - 31/12/9999')?.ate).toEqual(new Date('9999-12-31T23:59:59.999Z'));
  });

  it('sem espaços e virada de ano', () => {
    expect(intervaloDoSearch('01/12/2026-31/12/2026')?.ate).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it.each([[''], ['mercado'], ['31/02/2026 - 01/03/2026'], ['30/09/2026 - 01/09/2026'], ['01/09/2026'], [undefined], [['01/09/2026 - 30/09/2026']]])(
    'search=%p → sem filtro (como o legado)', (s) => {
      expect(intervaloDoSearch(s)).toBeNull();
    },
  );
});

describe('interpretarPeriodo (compartilhado com contas)', () => {
  it('mesmo formato da listagem de contas (ADR-004)', () => {
    expect(interpretarPeriodo('01/01/2027 - 31/01/2027')).toEqual({ inicio: '2027-01-01', fim: '2027-01-31' });
    expect(interpretarPeriodo('01/01/2027 - 31/01/2027 - 01/02/2027')).toBeNull();
  });
});
