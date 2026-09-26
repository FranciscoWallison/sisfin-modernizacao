// Registro ÚNICO das chaves de pg_advisory_xact_lock(chave, clienteId). Chave repetida serializaria módulos sem
// relação (revisão de segurança S8) — o teste cadastros-seguranca.spec.ts confere a unicidade.
export const CHAVES_ADVISORY_LOCK = {
  arvoreDeReceitas: 1, // categorias: escritas na árvore de receitas do cliente
  arvoreDeDespesas: 2, // categorias: escritas na árvore de despesas do cliente
  contaPadrao: 3, // contas-bancarias: troca da conta padrão do cliente
  logoDeBanco: 4, // admin-bancos: remoção de um arquivo de logo (2º argumento: hashtext do nome, não um cliente)
} as const;
