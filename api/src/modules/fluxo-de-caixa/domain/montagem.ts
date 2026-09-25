// Porte FIEL de formatPeriods / formatCategories do legado (CashFlowRepositoryTrait.php:86-132). Função pura.
// Valores em centavos; a borda HTTP converte para número.

export interface LinhaCategoria {
  id: number;
  name: string;
  period: string; // "aaaa-mm" ou "aaaa-mm-dd"
  totalCentavos: number;
}

export interface Periodo {
  period: string;
  revenues: { total: number };
  expenses: { total: number };
}

export interface CategoriaPeriodos {
  id: number;
  name: string;
  periods: { total: number; period: string }[];
}

/** formatPeriods: une os períodos dos dois lados (sem repetição, ordem de texto), zerando o lado sem valor. */
export function montarPeriodos(despesas: LinhaCategoria[], receitas: LinhaCategoria[]): Periodo[] {
  const periodos = [...new Set([...despesas.map((l) => l.period), ...receitas.map((l) => l.period)])].sort();
  const soma = (linhas: LinhaCategoria[], p: string) => linhas.filter((l) => l.period === p).reduce((s, l) => s + l.totalCentavos, 0);
  return periodos.map((period) => ({ period, revenues: { total: soma(receitas, period) }, expenses: { total: soma(despesas, period) } }));
}

/**
 * formatCategories: agrupa as linhas por categoria na ordem em que aparecem.
 * RN-FLX-008 (fiel ao legado, aguardando DUV-FLX-005): a deduplicação é pelo NOME — `unique('name')->pluck('name','id')`.
 * Se duas categorias raiz têm o mesmo nome, só a primeira (na ordem das linhas) aparece.
 */
export function montarCategorias(linhas: LinhaCategoria[]): CategoriaPeriodos[] {
  const porNome = new Map<string, number>(); // nome → id da PRIMEIRA ocorrência (unique('name'))
  for (const l of linhas) if (!porNome.has(l.name)) porNome.set(l.name, l.id);
  const categorias = new Map<number, string>(); // pluck('name', 'id'): ordem de inserção preservada
  for (const [nome, id] of porNome) categorias.set(id, nome);
  return [...categorias].map(([id, name]) => ({
    id,
    name,
    periods: linhas.filter((l) => l.id === id && l.name === name).map((l) => ({ total: l.totalCentavos, period: l.period })),
  }));
}

/** Resposta de /api/cash_flows: o "primeiro mês" (realizado) entra ANTES das linhas da janela, como o prepend do legado. */
export function montarFluxoMensal(e: {
  despesas: LinhaCategoria[];
  receitas: LinhaCategoria[];
  despesasPrimeiroMes: LinhaCategoria[];
  receitasPrimeiroMes: LinhaCategoria[];
  saldoAnteriorCentavos: number;
}) {
  const despesas = [...e.despesasPrimeiroMes, ...e.despesas];
  const receitas = [...e.receitasPrimeiroMes, ...e.receitas];
  return {
    period_list: montarPeriodos(despesas, receitas),
    balance_before_first_month: e.saldoAnteriorCentavos,
    categories_period: {
      expenses: { data: montarCategorias(despesas) },
      revenues: { data: montarCategorias(receitas) },
    },
  };
}
