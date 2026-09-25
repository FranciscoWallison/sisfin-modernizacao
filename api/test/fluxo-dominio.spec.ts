// F01–F02 — domínio puro do fluxo de caixa.
import { janelaDiaria, janelaMensal, MesInvalidoError } from '../src/modules/fluxo-de-caixa/domain/janela';
import { LinhaCategoria, montarCategorias, montarFluxoMensal, montarPeriodos } from '../src/modules/fluxo-de-caixa/domain/montagem';

describe('F01 — janelas', () => {
  it('REQ-FLX-02: sem start, começa no MÊS ATUAL e vai +10 meses (o legado fixava fev/2018)', () => {
    expect(janelaMensal('2026-09-25')).toEqual({
      inicio: '2026-09-01',
      fim: '2027-07-31',
      primeiroMes: { inicio: '2026-08-01', fim: '2026-08-31' },
      corteSaldo: '2026-08-01',
    });
  });

  it('com start=2018-02 reproduz a janela do legado — e o primeiro mês é janeiro INTEIRO (REQ-FLX-04)', () => {
    expect(janelaMensal('2026-09-25', '2018-02')).toEqual({
      inicio: '2018-02-01',
      fim: '2018-12-31',
      primeiroMes: { inicio: '2018-01-01', fim: '2018-01-31' }, // legado: 2018-01-31 a 2018-01-31
      corteSaldo: '2018-01-01', // saldo = extratos lançados antes de 01/01 → inclui o dia 31/12 inteiro (REQ-FLX-06)
    });
  });

  it('virada de ano no primeiro mês e no fim', () => {
    const j = janelaMensal('2027-01-10');
    expect(j.primeiroMes).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
    expect(j.fim).toBe('2027-11-30');
  });

  it('fevereiro de ano bissexto como primeiro mês', () => {
    expect(janelaMensal('2028-03-05').primeiroMes).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
  });

  it.each(['2018-13', '2018-00', '18-02', '2018-2', 'fev', "2018-02' OR 1=1"])('start inválido "%s" → erro (vira 422)', (s) => {
    expect(() => janelaMensal('2026-09-25', s)).toThrow(MesInvalidoError);
  });

  it('REQ-FLX-01: hoje até hoje + 30 dias, inclusive', () => {
    expect(janelaDiaria('2026-09-25')).toEqual({ inicio: '2026-09-25', fim: '2026-10-25' });
    expect(janelaDiaria('2026-12-15')).toEqual({ inicio: '2026-12-15', fim: '2027-01-14' });
  });
});

describe('F02 — montagem (porte fiel do legado)', () => {
  const l = (id: number, name: string, period: string, totalCentavos: number): LinhaCategoria => ({ id, name, period, totalCentavos });

  it('período esparso, ordenado, com o lado sem valor zerado', () => {
    expect(montarPeriodos([l(1, 'A', '2018-03', 3400)], [l(2, 'B', '2018-01', 1500), l(2, 'B', '2018-12', 300)])).toEqual([
      { period: '2018-01', revenues: { total: 1500 }, expenses: { total: 0 } },
      { period: '2018-03', revenues: { total: 0 }, expenses: { total: 3400 } },
      { period: '2018-12', revenues: { total: 300 }, expenses: { total: 0 } },
    ]);
  });

  it('soma várias categorias no mesmo período', () => {
    expect(montarPeriodos([l(1, 'A', '2018-03', 100), l(9, 'Z', '2018-03', 50)], [])[0].expenses.total).toBe(150);
  });

  it('categorias na ordem das linhas, com periods {total, period}', () => {
    expect(montarCategorias([l(1, 'A', '2018-03', 100), l(2, 'B', '2018-03', 5), l(1, 'A', '2018-04', 7)])).toEqual([
      { id: 1, name: 'A', periods: [{ total: 100, period: '2018-03' }, { total: 7, period: '2018-04' }] },
      { id: 2, name: 'B', periods: [{ total: 5, period: '2018-03' }] },
    ]);
  });

  it('RN-FLX-008 (fiel, aguardando DUV-FLX-005): duas categorias com o MESMO NOME → só a primeira aparece', () => {
    const cats = montarCategorias([l(121, 'Dup', '2018-06', 10000), l(122, 'Dup', '2018-06', 20000)]);
    expect(cats).toEqual([{ id: 121, name: 'Dup', periods: [{ total: 10000, period: '2018-06' }] }]);
    // … enquanto o total do mês soma as duas (a tabela da tela não fecha — é o bug registrado)
    expect(montarPeriodos([l(121, 'Dup', '2018-06', 10000), l(122, 'Dup', '2018-06', 20000)], [])[0].expenses.total).toBe(30000);
  });

  it('o "primeiro mês" entra ANTES das linhas da janela (prepend do legado)', () => {
    const r = montarFluxoMensal({
      despesas: [l(1, 'A', '2018-03', 3400)],
      receitas: [l(2, 'B', '2018-12', 300)],
      despesasPrimeiroMes: [],
      receitasPrimeiroMes: [l(2, 'B', '2018-01', 1500)],
      saldoAnteriorCentavos: 0,
    });
    expect(r.categories_period.revenues.data[0].periods.map((p) => p.period)).toEqual(['2018-01', '2018-12']);
    expect(r.period_list.map((p) => p.period)).toEqual(['2018-01', '2018-03', '2018-12']);
    expect(Object.keys(r)).toEqual(['period_list', 'balance_before_first_month', 'categories_period']);
  });
});
