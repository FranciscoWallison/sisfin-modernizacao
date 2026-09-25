Status: rascunho — aguardando aprovação do Francisco

# Requirements — módulo `fluxo-de-caixa` (TO-BE)

> Gerado de `.specs/legado/modulos/fluxo-de-caixa/regras.md` (RN-FLX-001..007) e `duvidas.md` (DUV-FLX-001..004).
> Contrato a preservar: `contrato.md` do módulo (mesmas rotas, mesmo formato). Correções: ADR-006 (proposto).
> Aceite: `.specs/paridade/fluxo-de-caixa/` com `--alvo novo` (divergências do ADR-006 registradas nos casos).

### REQ-FLX-01 — Próximos 30 dias, por dia
Origem: RN-FLX-001 · Decisão: **manter**

- QUANDO a tela pedir `GET /api/cash_flows/monthly`, O SISTEMA DEVE somar por dia de vencimento as contas a receber e a
  pagar do cliente, pagas ou não, de hoje até hoje + 30 dias (UTC, inclusive), só com os dias que têm movimento,
  em ordem crescente.

Aceite: `RN-FLX-001-proximos-30-dias.json` (paridade exata) e espelho de leitura.

### REQ-FLX-02 — Janela do fluxo mensal a partir do mês atual *(proposta — DUV-FLX-001)*
Origem: RN-FLX-002 · Decisão: **corrigir** — ADR-006

- QUANDO `GET /api/cash_flows` vier sem parâmetro, O SISTEMA DEVE usar início = primeiro dia do **mês atual** (UTC) e
  fim = último dia de início + 10 meses. *(legado: fixo em fev–dez/2018 → tela vazia)*
- QUANDO vier `?start=aaaa-mm` válido, O SISTEMA DEVE usar esse mês como início (mesma largura). Valor inválido → 422.

Aceite: `RN-FLX-002-janela-padrao.json` → `mes_atual_na_janela: true` (divergência ADR-006).

### REQ-FLX-03 — Projeção mensal por mês de vencimento
Origem: RN-FLX-003 · Decisão: **manter**

- O SISTEMA DEVE somar por mês (`aaaa-mm`) receitas e despesas **pagas ou não** dentro da janela; `period_list` só com
  meses que têm movimento, ordenado.

Aceite: `RN-FLX-003-a-007-janela-2018.json` (março +34, dezembro +3, janeiro/2019 fora) com `?start=2018-02`.

### REQ-FLX-04 — "Primeiro mês" = mês anterior inteiro, só o realizado *(proposta — DUV-FLX-002)*
Origem: RN-FLX-004 · Decisão: **corrigir** — ADR-006

- O SISTEMA DEVE incluir, como mês anterior ao início, a soma das contas **pagas** com vencimento em **qualquer dia**
  desse mês. *(legado: só as pagas que vencem no último dia)*

Aceite: `RN-FLX-003-a-007-janela-2018.json` → `primeiro_mes_receitas_delta: 15` (legado: 5 — divergência ADR-006).

### REQ-FLX-05 — Agregação por categoria raiz
Origem: RN-FLX-005 · Decisão: **manter**

- O SISTEMA DEVE somar cada valor na categoria **raiz** da árvore da conta; filhas não aparecem sozinhas;
  `categories_period` ordenado por período e nome.

Aceite: `RN-FLX-003-a-007-janela-2018.json` (`raiz_despesa_marco_delta`, `categoria_filha_nao_aparece_sozinha`).

### REQ-FLX-06 — Saldo antes do primeiro mês *(corte proposto — DUV-FLX-003)*
Origem: RN-FLX-006 · Decisão: **manter** a regra (último extrato por conta bancária, por data de lançamento) +
**corrigir** o corte para incluir o último dia inteiro — ADR-006

- `balance_before_first_month` = soma, por conta bancária do cliente, do saldo do último extrato lançado **antes do
  primeiro dia** do mês do "primeiro mês".

Aceite: `RN-FLX-003-a-007-janela-2018.json` (`saldo_antes_do_primeiro_mes_inalterado`) + teste de integração com
extratos lançados no último dia do mês (não observável pela API: extratos têm data de lançamento = agora).

### REQ-FLX-07 — Isolamento entre clientes
Origem: RN-FLX-007 · Decisão: **manter** o resultado + **corrigir** a defesa (proposta — DUV-FLX-004) — ADR-006

- O SISTEMA DEVE filtrar por cliente a categoria raiz, as filhas **e** as contas (defesa em profundidade: com árvore
  íntegra o resultado é o mesmo do legado; com árvore corrompida, não vaza).

Aceite: `RN-FLX-003-a-007-janela-2018.json` (`outro_cliente_nao_ve_nada`) + teste de integração com árvore corrompida
de propósito.
