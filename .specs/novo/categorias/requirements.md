Status: aprovado — Francisco, 25/09/2026 (com o plano, hash baf1b8d63868). Mudanças posteriores no fim do arquivo.

# Requirements — módulo `categorias` (escrita) — TO-BE

> Gerado de `.specs/legado/modulos/categorias/regras.md` (RN-CAT-001..011) e `duvidas.md` (DUV-CAT-001..006).
> Contrato a preservar: `contrato.md` do módulo. Correções: ADR-007 (aceito).
> Aceite: `.specs/paridade/categorias/` com `--alvo novo` (divergências do ADR-007 registradas nos casos) + espelho.
> Vale igualmente para `/api/category_revenues` e `/api/category_expenses`.

### REQ-CAT-01 — Criar, editar e ler na própria árvore
Origem: RN-CAT-001, RN-CAT-008 · Decisão: **manter**

- QUANDO o usuário criar uma categoria sem `parent_id`, O SISTEMA DEVE criá-la como raiz do cliente → 201.
- QUANDO criar com `parent_id` de uma categoria do cliente, na mesma árvore (receita/despesa), O SISTEMA DEVE criá-la
  como filha → 201.
- QUANDO editar com `parent_id`, O SISTEMA DEVE renomear e colocar sob esse pai → 200.
- `GET /{id}`, `POST` e `PUT` DEVEM responder com a categoria, `depth` e `children.data` recursivo, no formato do
  contrato.
- O SISTEMA DEVE manter `_lft/_rgt` coerentes com `parent_id` dentro do cliente depois de toda escrita, porque o
  fluxo de caixa agrega por eles.

Aceite: `RN-CAT-001-arvore.json`, `RN-CBA-007-…json` (`categoria_show_formato`); integração: invariantes do nested set
após criar/mover/excluir, inclusive sob escritas concorrentes.

### REQ-CAT-02 — Validação
Origem: RN-CAT-002 · Decisão: **manter**

- `name` obrigatório e com no máximo 255 caracteres; `parent_id`, quando vier, DEVE existir na mesma tabela e ser do
  cliente. Senão → 422 no formato do Laravel (`{"parent_id":["The selected parent id is invalid."]}`).
- A validação do corpo DEVE vir antes da checagem de existência (como no legado: corpo inválido → 422, mesmo para id
  alheio).

Aceite: `RN-CAT-001` (`sem_nome`, `receita_com_pai_de_despesa`), `RN-CAT-003` (`b_cria_filha_sob_a`).

### REQ-CAT-03 — Categoria de outro cliente: 404 e nada muda
Origem: RN-CAT-003, RN-CAT-006 · Decisão: **corrigir** (segurança) — ADR-007

- QUANDO o `id` da rota não for do cliente, O SISTEMA DEVE responder 404 em `GET`, `PUT` e `DELETE` **sem gravar
  nada**. *(legado: o `PUT` grava — renomeia e move para a árvore do atacante)*

Aceite: `RN-CAT-003-edicao-entre-clientes.json` → `nome_intacto_apos_ataque: true`,
`filha_continua_na_arvore_de_a: true` (divergência ADR-007).

### REQ-CAT-04 — Ciclo na árvore → 422
Origem: RN-CAT-004 · Decisão: **corrigir** — ADR-007

- QUANDO o `parent_id` for a própria categoria ou uma descendente dela, O SISTEMA DEVE responder 422
  `{"parent_id":["The selected parent id is invalid."]}` e não gravar. *(legado: 500)*

Aceite: `RN-CAT-004-ciclos-e-exclusao-com-contas.json` → `raiz_dentro_da_neta` e `pai_de_si_mesma` 422.

### REQ-CAT-05 — Exclusão tudo ou nada
Origem: RN-CAT-005, RN-CAT-009 · Decisão: **corrigir** — ADR-007

- QUANDO a categoria e suas descendentes não tiverem contas, O SISTEMA DEVE apagar toda a subárvore → 204.
- QUANDO qualquer categoria da subárvore tiver contas, O SISTEMA DEVE responder 422 `{"message":"Category has bills."}`
  e **não apagar nada**. *(legado: 500 e, se a conta estiver numa descendente, a raiz é apagada e as filhas ficam órfãs)*

Aceite: `RN-CAT-001` (`excluir_raiz` 204), `RN-CAT-004` (`excluir_neta_com_conta` 422),
`RN-CAT-009-excluir-raiz-com-filha-com-contas.json` → 422, `raiz_depois` 200, `filhas_visiveis_na_arvore: true`.

### REQ-CAT-06 — Editar sem `parent_id` torna a categoria raiz
Origem: RN-CAT-007 · Decisão: **manter** (é como a tela promove uma categoria)

- QUANDO o `PUT` vier sem `parent_id` (ou com `null`), O SISTEMA DEVE tornar a categoria raiz.

Aceite: `RN-CAT-001` (`renomear_filha_sem_pai`).

### REQ-CAT-07 — Corpo que a tela envia
Origem: RN-CAT-010 · Decisão: **manter**

- O SISTEMA DEVE aceitar e ignorar `id` no corpo (vale o da rota; ao criar, o id é gerado). Qualquer outro campo
  desconhecido → 422 (whitelist).

Aceite: `RN-CAT-010-corpo-da-tela.json`.

### REQ-CAT-08 — Ordem da listagem por id
Origem: RN-CAT-011 · Decisão: **manter** (e corrigir o compat, que ordena por `_lft`)

- A árvore DEVE sair com raízes e filhas em ordem de id, em toda resposta.

Aceite: `RN-CAT-011-ordem-da-listagem.json`; espelho `/api/category_*` sem diferença.
