// T09–T11 — domínio puro do módulo contas.
import { interpretarBusca } from '../src/modules/contas/domain/busca';
import { deCentavos, paraCentavos } from '../src/modules/contas/domain/dinheiro';
import { EstadoConta, movimentos } from '../src/modules/contas/domain/movimentos';
import { ANUAL, MENSAL, vencimentosDasRepeticoes } from '../src/modules/contas/domain/vencimentos';

describe('T09 — vencimentos das repetições (REQ-CON-03)', () => {
  it('RN-CON-002: 31/01 mensal → 28/02, 31/03, 30/04 (sempre a partir da data original)', () => {
    expect(vencimentosDasRepeticoes('2027-01-31', 3, MENSAL)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30']);
  });
  it('ano bissexto: 31/01/2028 → 29/02/2028', () => {
    expect(vencimentosDasRepeticoes('2028-01-31', 1, MENSAL)).toEqual(['2028-02-29']);
  });
  it('virada de ano', () => {
    expect(vencimentosDasRepeticoes('2026-11-15', 3, MENSAL)).toEqual(['2026-12-15', '2027-01-15', '2027-02-15']);
  });
  it('anual, inclusive 29/02 → 28/02 no ano não bissexto', () => {
    expect(vencimentosDasRepeticoes('2028-02-29', 2, ANUAL)).toEqual(['2029-02-28', '2030-02-28']);
  });
  it('N = 0 → nenhuma repetição (a conta informada é criada à parte: total N+1 — RN-CON-001)', () => {
    expect(vencimentosDasRepeticoes('2027-01-31', 0, MENSAL)).toEqual([]);
  });
});

describe('dinheiro em centavos (RN-CON-011)', () => {
  it.each([['10', 1000], ['10.5', 1050], ['10.50', 1050], ['0.01', 1], [1234.56, 123456], ['-15', -1500]])('%s → %s', (e, s) => {
    expect(paraCentavos(e as string)).toBe(s);
  });
  it('mais de 2 casas → erro', () => expect(() => paraCentavos('1.234')).toThrow());
  it('volta para texto decimal', () => {
    expect(deCentavos(123450)).toBe('1234.50');
    expect(deCentavos(-5)).toBe('-0.05');
  });
  it('0,1 + 0,2 sem erro de ponto flutuante', () => {
    expect(deCentavos(paraCentavos('0.1') + paraCentavos('0.2'))).toBe('0.30');
  });
});

describe('T10 — movimentos de saldo (design §5)', () => {
  const aberta = (valor: number, conta = 1): EstadoConta => ({ valor, paga: false, contaBancaria: conta });
  const paga = (valor: number, conta = 1): EstadoConta => ({ valor, paga: true, contaBancaria: conta });

  it('null → aberta: nada', () => expect(movimentos('pagar', null, aberta(1000))).toEqual([]));
  it('null → paga (REQ-CON-05): −valor', () =>
    expect(movimentos('pagar', null, paga(1000))).toEqual([{ contaBancaria: 1, delta: -1000, kind: 'movimento', acao: 'criacao' }]));
  it('aberta → paga (RN-CON-003): −valor', () =>
    expect(movimentos('pagar', aberta(1000), paga(1000))).toEqual([{ contaBancaria: 1, delta: -1000, kind: 'movimento', acao: 'pagamento' }]));
  it('paga → paga com valor 10 → 25 (RN-CON-004): −15', () =>
    expect(movimentos('pagar', paga(1000), paga(2500))).toEqual([{ contaBancaria: 1, delta: -1500, kind: 'movimento', acao: 'alteracao' }]));
  it('paga → aberta (RN-CON-005): +antigo', () =>
    expect(movimentos('pagar', paga(2500), aberta(2500))).toEqual([{ contaBancaria: 1, delta: 2500, kind: 'estorno', acao: 'estorno' }]));
  it('paga → aberta com valor mudando: estorna o ANTIGO', () =>
    expect(movimentos('pagar', paga(2500), aberta(9900))[0].delta).toBe(2500));
  it('aberta → aberta, valor mudou: nada', () => expect(movimentos('pagar', aberta(1000), aberta(5000))).toEqual([]));
  it('paga A → paga B (REQ-CON-08, corrige RN-CON-009): +em A, − em B', () =>
    expect(movimentos('pagar', paga(1000, 1), paga(1000, 2))).toEqual([
      { contaBancaria: 1, delta: 1000, kind: 'estorno', acao: 'alteracao' },
      { contaBancaria: 2, delta: -1000, kind: 'movimento', acao: 'alteracao' },
    ]));
  it('paga A → paga B com valor novo: devolve antigo em A, aplica novo em B', () => {
    const m = movimentos('pagar', paga(1000, 1), paga(3000, 2));
    expect(m.map((x) => [x.contaBancaria, x.delta])).toEqual([[1, 1000], [2, -3000]]);
  });
  it('paga → excluída (REQ-CON-09, corrige RN-CON-010): +antigo como estorno', () =>
    expect(movimentos('pagar', paga(1000), null)).toEqual([{ contaBancaria: 1, delta: 1000, kind: 'estorno', acao: 'exclusao' }]));
  it('aberta → excluída: nada', () => expect(movimentos('pagar', aberta(1000), null)).toEqual([]));
  it('conta a RECEBER inverte todos os sinais', () => {
    expect(movimentos('receber', null, paga(1000))[0].delta).toBe(1000);
    expect(movimentos('receber', paga(1000), paga(2500))[0].delta).toBe(1500);
    expect(movimentos('receber', paga(1000), null)[0].delta).toBe(-1000);
  });
});

describe('T11 — busca (REQ-CON-11, ADR-004)', () => {
  it('vazio ou só espaços → sem filtro (corrige RN-CON-016)', () => {
    expect(interpretarBusca('')).toBeNull();
    expect(interpretarBusca('   ')).toBeNull();
    expect(interpretarBusca(undefined)).toBeNull();
  });
  it('texto comum → só texto', () => expect(interpretarBusca('aluguel')).toEqual({ texto: 'aluguel' }));
  it('período como a tela envia ("01/09/2026 - 30/09/2026")', () =>
    expect(interpretarBusca('01/09/2026 - 30/09/2026')?.periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' }));
  it('período sem espaços', () =>
    expect(interpretarBusca('01/01/2027-31/12/2027')?.periodo).toEqual({ inicio: '2027-01-01', fim: '2027-12-31' }));
  it('período NÃO vira valor (o legado lia "01…" como 1)', () =>
    expect(interpretarBusca('01/01/2027-31/12/2027')?.valorCentavos).toBeUndefined());
  it('data inválida não vira período', () => expect(interpretarBusca('31/02/2027-01/03/2027')?.periodo).toBeUndefined());
  it.each([['10', 1000], ['1.234,56', 123456], ['0,5', 50], ['1234,5', 123450]])('valor BR %s → %s centavos', (t, c) => {
    expect(interpretarBusca(t)?.valorCentavos).toBe(c);
  });
  it('texto com número dentro não é valor', () => expect(interpretarBusca('PAR-017')?.valorCentavos).toBeUndefined());
  it('limita a 100 caracteres', () => expect(interpretarBusca('x'.repeat(300))?.texto).toHaveLength(100));
});
