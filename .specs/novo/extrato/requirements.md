Status: rascunho — aguardando aprovação do Francisco

# Requirements — módulo `extrato` — TO-BE

> Gerado de `.specs/legado/modulos/extrato/regras.md` (RN-EXT-001..007) e `duvidas.md` (DUV-EXT-001..003).
> Contrato a preservar: `contrato.md` do módulo. Correções: ADR-008 (proposto).
> Aceite: `.specs/paridade/extrato/` com `--alvo novo` (divergências do ADR-008 registradas nos casos) + espelho.

### REQ-EXT-01 — Lista paginada de lançamentos do cliente
Origem: RN-EXT-001, RN-EXT-006 · Decisão: **manter**

- `GET /api/statements` DEVE devolver os lançamentos do cliente no formato do contrato:
  - `id`, `date` (dia em que o lançamento foi gravado), `value`, `balance`, `bank_account_id`;
  - com `include=bankAccount`, a conta bancária no formato da leitura;
  - paginação no formato das outras listas.
- Lançamento de outro cliente nunca aparece, nem pela conta bancária incluída.

Aceite: `RN-EXT-001-a-004` (campos, data, conta incluída, outro cliente intocado); espelho das URLs do extrato.

### REQ-EXT-02 — Totais do conjunto, não da página
Origem: RN-EXT-002 · Decisão: **manter**

- `statement_data` DEVE trazer `count`, `revenues.total` (contas a receber) e `expenses.total` (contas a pagar) sobre
  **todos** os lançamentos que a lista considera (todas as páginas), independente de ordenação.

Aceite: `RN-EXT-001-a-004` (`delta_count` 1, `delta_receitas` 12,34, `delta_despesas` 0).

### REQ-EXT-03 — O período da tela filtra lista e totais
Origem: RN-EXT-003 · Decisão: **corrigir** — ADR-008

- QUANDO `search` vier no formato de período da tela (`dd/mm/aaaa - dd/mm/aaaa`), O SISTEMA DEVE considerar só os
  lançamentos gravados nesse intervalo (dias inclusive, UTC), na lista **e** nos totais. *(legado: ignora)*
- QUANDO `search` vier vazio ou sem período, O SISTEMA DEVE ignorá-lo (como o legado).

Aceite: `RN-EXT-001-a-004`:
- `periodo_sem_lancamentos_zera_lista_e_totais: true` e `busca_por_periodo_ignorada: false` (divergência ADR-008);
- `periodo_amplo_mantem_tudo: true` (igual ao legado).

### REQ-EXT-04 — 15 por página, `limit` ignorado
Origem: RN-EXT-004 · Decisão: **manter** (DUV-EXT-003)

- O SISTEMA DEVE paginar o extrato com 15 itens e ignorar `?limit`.

Aceite: `RN-EXT-001-a-004` (`limit_5` → `per_page: 15`).

### REQ-EXT-05 — Ordenação pelos cabeçalhos da tela
Origem: RN-EXT-005 · Decisão: **corrigir** — ADR-008

- O SISTEMA DEVE aceitar `orderBy`:
  - `id`, `value`, `balance`, `bank_account_id`;
  - `date` (data do lançamento);
  - a chave da tela `bank_accounts:bank_account_id|bank_accounts.name` (nome da conta bancária).
- Todas com `sortedBy` `asc`/`desc` e desempate por id. *(legado: `date` e conta → 500)*
- Qualquer outro valor → 422 `{"orderBy":["The selected order by is invalid."]}`. *(legado: 500)*

Aceite: `RN-EXT-005` (valor e saldo em ordem; Data e Conta 200; inexistente 422 — divergência ADR-008).

### REQ-EXT-06 — Lançamentos órfãos continuam no extrato
Origem: RN-EXT-007 · Decisão: **manter**

- Lançamentos cuja conta de origem foi excluída DEVEM continuar listados e somados (histórico preservado, REQ-CON-09).

Aceite: teste de integração (conta paga excluída → o lançamento continua na lista e nos totais).
