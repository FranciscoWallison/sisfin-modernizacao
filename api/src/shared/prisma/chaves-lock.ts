// Registro ÚNICO das chaves de pg_advisory_xact_lock(chave, clienteId). Chave repetida serializaria módulos sem
// relação (revisão de segurança S8) — o teste cadastros-seguranca.spec.ts confere a unicidade.
export const CHAVES_ADVISORY_LOCK = {
  arvoreDeReceitas: 1, // categorias: escritas na árvore de receitas do cliente
  arvoreDeDespesas: 2, // categorias: escritas na árvore de despesas do cliente
  contaPadrao: 3, // contas-bancarias: troca da conta padrão do cliente
  logoDeBanco: 4, // admin-bancos: remoção de um arquivo de logo (2º argumento: hashtext do nome, não um cliente)
  checkoutDoCliente: 5, // assinaturas: um checkout por vez por cliente (evita duas sessões e cobrança dupla)
  eventoDaAssinatura: 6, // assinaturas: eventos da MESMA assinatura em série (2º argumento: hashtext do id no provedor)
} as const;
