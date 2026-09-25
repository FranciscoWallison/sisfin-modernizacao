# ADR-007 — Comportamentos do legado corrigidos nos módulos `categorias` e `contas-bancarias`

- **Status:** aceito — aprovado — Francisco, 25/09/2026 (com os planos: categorias hash baf1b8d63868, contas-bancarias hash 547b3519e39d)
- **Data:** 25/09/2026

## Contexto

O levantamento da escrita de categorias e contas bancárias (`.specs/legado/modulos/categorias/` e
`.specs/legado/modulos/contas-bancarias/`) provou por sonda:

- **uma vulnerabilidade** (RN-CAT-003): outro cliente renomeia e move categorias alheias. A resposta é 404, mas a
  escrita acontece. Movida para a árvore do atacante, a categoria leva junto os **valores do fluxo de caixa** da vítima;
- **uma corrupção de dados** (RN-CAT-009): excluir uma raiz cuja filha tem contas dá 500, mas a raiz já foi apagada e as
  filhas ficam órfãs, invisíveis na tela;
- **quatro 500** que são, na verdade, erros de validação: ciclo na árvore, categoria com contas, `bank_id` inexistente
  e conta bancária com lançamentos;
- **uma corrida** (RN-CBA-002): a troca da conta padrão roda num listener, fora de transação.

O SPA não trata erro em nenhum `dispatch` (não tem `.catch`). Trocar 500 por 422 não muda o que a tela mostra.

## Decisão

| Regra | Legado | Sistema novo | Dúvida |
|---|---|---|---|
| RN-CAT-003 | B edita categoria de A: 404, **mas grava** | 404 e **nada muda** | DUV-CAT-001 |
| RN-CAT-004 | Ciclo → 500 | 422 `{"parent_id":["The selected parent id is invalid."]}` | DUV-CAT-002 |
| RN-CAT-005 | Categoria com contas → 500 | 422 `{"message":"Category has bills."}` | DUV-CAT-002 |
| RN-CAT-009 | Raiz com descendente com contas → 500 **e raiz apagada** (órfãs) | Tudo ou nada: 422 (mesma mensagem) e nada é apagado | DUV-CAT-003 |
| RN-CBA-004 | `bank_id` inexistente → 500 | 422 `{"bank_id":["The selected bank id is invalid."]}` | DUV-CBA-001 |
| RN-CBA-005 | Conta com lançamentos → 500 | 422 `{"message":"Bank account has entries."}` | DUV-CBA-001 |
| RN-CBA-002 | Troca da padrão fora de transação | Mesma transação, com lock, e índice único parcial `(client_id) WHERE "default"` | DUV-CBA-003 |
| RN-CBA-007 | `logo` montado com o host da requisição | Montado com a URL base configurada (`ASSETS_URL`), no mesmo formato | DUV-CBA-005 |

**Mantidos de propósito**, por compatibilidade com a tela:

- editar sem `parent_id` vira raiz (RN-CAT-007);
- `balance` no corpo é ignorado (RN-CBA-003);
- a tela envia campos extras (`id`, e na conta bancária o objeto inteiro do GET), que são aceitos e ignorados
  (RN-CAT-010, RN-CBA-009);
- a ordem da listagem é por id (RN-CAT-011).

## Consequências

- **Casos de paridade.** Ganham `divergencias` referindo este ADR:
  - `RN-CAT-003` (`nome_intacto_apos_ataque`, `filha_continua_na_arvore_de_a` → `true`);
  - `RN-CAT-004` (três 422);
  - `RN-CAT-009` (422, raiz continua, filhas visíveis);
  - `RN-CBA-003-a-005` (dois 422).
- **Nested set por cliente** no sistema novo. Depois de cada escrita, a numeração `_lft/_rgt` do cliente é recalculada
  a partir de `parent_id`. As faixas de clientes diferentes podem se sobrepor, o que é inofensivo porque todo uso de
  `_lft/_rgt` também compara `client_id` (fluxo de caixa, ADR-006 / REQ-FLX-07). Com isso, nenhuma escrita toca linhas
  de outro cliente. Nota: com dados do sistema novo, a checagem de árvore por `_lft/_rgt` do ETL só vale na origem
  (MySQL), que é onde ela roda.
- **Whitelist.** Continua global (`forbidNonWhitelisted`). Os DTOs declaram explicitamente os campos da tela que são
  ignorados, e qualquer outro campo continua dando 422.
- **Cutover.** Categorias órfãs e árvores entre clientes já existentes **bloqueiam** o cutover pelo relatório do ETL
  (DUV-CAT-004 fica em aberto e é decidida caso a caso).
