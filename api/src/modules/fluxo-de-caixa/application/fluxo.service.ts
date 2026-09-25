import { Injectable } from '@nestjs/common';
import { janelaDiaria, janelaMensal } from '../domain/janela';
import { LinhaCategoria, montarFluxoMensal, montarPeriodos } from '../domain/montagem';
import { FluxoRepositorio, LinhaSql } from '../infra/fluxo.repositorio';

const hojeUtc = () => new Date().toISOString().slice(0, 10); // UTC, como o legado

// "123.45" → 12345 (o SUM vem com 2 casas do DECIMAL(12,2)). Formato validado e sem perda de precisão:
// fora do padrão (ex.: "NaN") ou acima do inteiro seguro → erro, nunca um número errado (revisão do módulo).
const centavos = (texto: string) => {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!m) throw new Error(`soma monetária fora do formato: ${texto}`);
  const abs = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0'));
  if (abs > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('soma monetária acima do limite seguro');
  return Number(m[1] ? -abs : abs);
};
const linhas = (sql: LinhaSql[]): LinhaCategoria[] =>
  sql.map((l) => ({ id: l.id, name: l.name, period: l.period, totalCentavos: centavos(l.total) }));

@Injectable()
export class FluxoService {
  constructor(private readonly repo: FluxoRepositorio) {}

  /** GET /api/cash_flows (REQ-FLX-02..07). */
  async mensal(clienteId: number, start?: string) {
    const j = janelaMensal(hojeUtc(), start);
    const [receitas, despesas, receitasPrimeiroMes, despesasPrimeiroMes, saldo] = await Promise.all([
      this.repo.somarPorCategoriaRaiz('receitas', clienteId, j.inicio, j.fim, 'mes'),
      this.repo.somarPorCategoriaRaiz('despesas', clienteId, j.inicio, j.fim, 'mes'),
      this.repo.somarPorCategoriaRaiz('receitas', clienteId, j.primeiroMes.inicio, j.primeiroMes.fim, 'mes', true),
      this.repo.somarPorCategoriaRaiz('despesas', clienteId, j.primeiroMes.inicio, j.primeiroMes.fim, 'mes', true),
      this.repo.saldoAntesDe(clienteId, j.corteSaldo),
    ]);
    return montarFluxoMensal({
      receitas: linhas(receitas),
      despesas: linhas(despesas),
      receitasPrimeiroMes: linhas(receitasPrimeiroMes),
      despesasPrimeiroMes: linhas(despesasPrimeiroMes),
      saldoAnteriorCentavos: centavos(saldo),
    });
  }

  /** GET /api/cash_flows/monthly (REQ-FLX-01). */
  async diario(clienteId: number) {
    const j = janelaDiaria(hojeUtc());
    const [receitas, despesas] = await Promise.all([
      this.repo.somarPorCategoriaRaiz('receitas', clienteId, j.inicio, j.fim, 'dia'),
      this.repo.somarPorCategoriaRaiz('despesas', clienteId, j.inicio, j.fim, 'dia'),
    ]);
    return { period_list: montarPeriodos(linhas(despesas), linhas(receitas)) };
  }
}
