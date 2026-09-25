// T08 — paginação no formato do Fractal/Laravel (achado pelo espelho de leitura: links preservam a query).
import { limiteDaQuery, metaPaginacao, paginaDaQuery, urlDaPagina } from '../src/shared/http/paginacao';

describe('paginação compatível (T08)', () => {
  it('link mantém os parâmetros na ordem e acrescenta page no fim', () => {
    expect(urlDaPagina('http://h/api/statements', { orderBy: 'id', sortedBy: 'desc' }, 2)).toBe(
      'http://h/api/statements?orderBy=id&sortedBy=desc&page=2',
    );
  });

  it('page que já veio na query vai para o FIM (como o oráculo faz — capturado do tráfego real do SPA)', () => {
    expect(urlDaPagina('http://h/x', { page: '1', orderBy: 'balance', limit: '5' }, 2)).toBe(
      'http://h/x?orderBy=balance&limit=5&page=2',
    );
  });

  it('limit: >0 vira per_page (teto 100); inválido → 15', () => {
    expect(limiteDaQuery('5')).toBe(5);
    expect(limiteDaQuery('0')).toBe(15);
    expect(limiteDaQuery('999')).toBe(100);
    expect(limiteDaQuery(undefined)).toBe(15);
  });

  it('sem próxima nem anterior, links é array vazio (como o Fractal serializa)', () => {
    expect(metaPaginacao(9, 9, 1, 'http://h/x').pagination).toEqual({
      total: 9, count: 9, per_page: 15, current_page: 1, total_pages: 1, links: [],
    });
  });

  it('page inválido ou fora do limite vira 1', () => {
    expect(paginaDaQuery('abc')).toBe(1);
    expect(paginaDaQuery('0')).toBe(1);
    expect(paginaDaQuery('10001')).toBe(1);
    expect(paginaDaQuery('3')).toBe(3);
  });
});
