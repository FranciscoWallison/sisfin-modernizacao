# Regras de negócio — módulo `fluxo-de-caixa` (AS-IS)

> Levantadas em 25/09/2026: leitura de `legacy/app/Http/Controllers/Api/CashFlowsController.php` e
> `legacy/app/Repositories/Traits/CashFlowRepositoryTrait.php`, SQL observado com `tools/oraculo-sql.mjs` e casos de
> paridade em `.specs/paridade/fluxo-de-caixa/` (usuário `cliente1@user.com`, cliente 2).

### RN-FLX-001 — Próximos 30 dias, por dia (`/api/cash_flows/monthly`, gráfico do dashboard)
- **Regra:** soma, por DIA de vencimento, de contas a receber (`revenues`) e a pagar (`expenses`) — pagas ou não — de hoje até hoje + 30 dias (inclusive, UTC). Só os dias com movimento aparecem, em ordem crescente, no formato `aaaa-mm-dd`.
- **Evidência:** `CashFlowsController.php:33-38` (`new Carbon()` → `addDays(30)`), `CashFlowRepositoryTrait.php:16-41` (formato `%Y-%m-%d`)
- **Sonda:** `paridade/fluxo-de-caixa/RN-FLX-001-proximos-30-dias.json` — a pagar em aberto (10) e a receber paga (20) daqui a 5 dias → deltas 10 e 20 no dia; conta daqui a 45 dias fora; janela de hoje a hoje+30 ✅
- **Confiança:** alta

### RN-FLX-002 — A janela do fluxo mensal é FIXA no código: fev–dez/2018
- **Regra:** `GET /api/cash_flows` ignora a data de hoje e qualquer parâmetro: início em `2018-02-01`, fim 10 meses depois. Com dados atuais, a tela de fluxo de caixa aparece **vazia**.
- **Evidência:** `CashFlowsController.php:28-29` (`new Carbon('2018-02-01')`, `addMonths(10)`)
- **Sonda:** conta criada hoje não aparece; tudo o que aparece é de 2018 (`RN-FLX-002-janela-padrao.json`) ✅. SQL: `date_due between '2018-02-01' and '2018-12-31'`
- **Contexto:** a tela calcula o "primeiro mês" como **o mês anterior a hoje** (`store/cash-flow.js`, `setFirstMonthYear(new Date())` → `subtract(1, 'months')`), ou seja, espera a janela a partir do mês atual. A data fixa é um atalho da época do TCC.
- **Confiança:** alta · **Suspeita de bug?** sim (DUV-FLX-001)

### RN-FLX-003 — Projeção mensal: contas pagas OU NÃO, por mês de vencimento
- **Regra:** de início até início + 10 meses (fim do mês), soma por mês (`aaaa-mm`) de receitas e despesas, **independente de pagas**. `period_list` é esparso (só meses com movimento) e ordenado.
- **Evidência:** `CashFlowRepositoryTrait.php:156-186` (`getCategoriesValuesCollection`), `:194-227` (consulta), `:109-132` (`formatPeriods`)
- **Sonda:** março/2018 com uma a pagar em aberto (30) e uma paga (4) → +34; dezembro/2018 (último mês) +3; janeiro/2019 fora da janela ✅
- **Confiança:** alta

### RN-FLX-004 — "Primeiro mês" (realizado) considera só o ÚLTIMO DIA do mês anterior
- **Regra:** a coluna do mês anterior ao início deveria ser o **realizado** (só contas pagas). O código passa a mesma data como início e fim — o último dia do mês — então só entram contas **pagas que vencem nesse dia**.
- **Evidência:** `CashFlowRepositoryTrait.php:161-172` (`getQueryCategoriesValuesByPeriodAndDone($model, $billTable, $firstDateEndStr, $firstDateEndStr)`); SQL: `date_due between '2018-01-31' and '2018-01-31' … and done = true`
- **Sonda:** janeiro/2018 com recebidas no dia 15 (10) e no dia 31 (5), e uma não recebida no dia 31 (7) → o legado mostra **+5** (só a do dia 31 paga) ✅
- **Confiança:** alta · **Suspeita de bug?** **sim** — o esperado seria +15 (DUV-FLX-002)

### RN-FLX-005 — Agregação por categoria RAIZ (nested set)
- **Regra:** cada valor é somado na categoria **raiz** da árvore da conta (a categoria e todas as filhas via `_lft`/`_rgt`); categorias filhas não aparecem sozinhas em `categories_period`. Ordem: período, nome.
- **Evidência:** `CashFlowRepositoryTrait.php:199-215` (join `childorself` por `_lft`/`_rgt`, profundidade = 0)
- **Sonda:** conta de 30 numa categoria filha + 4 na raiz → raiz com +34 em março; a filha não aparece ✅
- **Confiança:** alta

### RN-FLX-006 — Saldo antes do primeiro mês vem do EXTRATO (data de lançamento)
- **Regra:** `balance_before_first_month` = soma, por conta bancária, do saldo do **último extrato criado** até o fim do mês anterior ao "primeiro mês" (início − 2 meses). Usa `statements.created_at` (quando foi lançado), não o vencimento. A comparação é `created_at <= 'aaaa-mm-dd'` — ou seja, até **00:00** do último dia: lançamentos feitos durante esse dia ficam de fora.
- **Evidência:** `CashFlowRepositoryTrait.php:45-47` e `:66-84`; SQL: `statements.created_at <= '2017-12-31'` com `MAX(id)` por conta
- **Sonda:** criar contas pagas hoje não muda o saldo anterior de 2018 (0) ✅
- **Confiança:** alta (código + SQL) · **Suspeita de bug?** o corte às 00:00 do último dia (DUV-FLX-003)

### RN-FLX-007 — Isolamento depende da integridade da árvore de categorias
- **Regra:** o filtro de cliente é aplicado à categoria **raiz**; as filhas (`childorself`) e as contas **não** são filtradas por `client_id` — o isolamento vem de a subárvore de uma raiz conter só categorias do mesmo cliente.
- **Evidência:** SQL observado: `client_id = 2` só em `category_*` (raiz) e na subconsulta de profundidade; nenhum filtro em `childorself` nem em `bill_*`
- **Sonda:** outro cliente (`cliente3`) não vê nada do que o cliente 2 criou em 2018 ✅; no banco do oráculo, **0** raízes com filhas de outro cliente
- **Confiança:** alta · **Risco:** a criação de categoria no legado desliga o tenant (inventário) — uma árvore corrompida vazaria valores entre clientes
