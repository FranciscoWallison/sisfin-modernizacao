# Regras de negócio — módulo `extrato` (AS-IS)

> Levantadas em 25/09/2026. Fontes:
> - código: `legacy/app/Http/Controllers/Api/StatementsController.php`, `Repositories/StatementRepositoryEloquent.php`,
>   `Transformers/StatementTransformer.php` e `StatementSerializerTransformer.php`, `Models/Statement.php`;
> - tela: `legacy/resources/assets/spa/js/components/statement/StatementList.vue`, `store/statement.js`;
> - SQL e erros observados com `tools/oraculo-sql.mjs` e no `laravel.log`;
> - casos em `.specs/paridade/extrato/`.
>
> A rota é só de leitura (`GET /api/statements`). Os lançamentos são gravados pelo módulo `contas` (RN-CON-003..010).
> No sistema novo, ela é respondida hoje pelo compat (T08 de `contas`).

### RN-EXT-001 — Lista paginada de lançamentos do cliente
- **Regra:**
  - `GET /api/statements` → `{ data: { statements: { data: [...], meta: { pagination } }, statement_data } }`.
  - Cada lançamento traz `id`, `date`, `value`, `balance` e `bank_account_id`; com `include=bankAccount`, vem também a
    conta bancária no formato da leitura.
  - `date` é o dia em que o lançamento foi **gravado** (`created_at`), não o vencimento da conta.
  - Sem `orderBy`, a ordem é a do índice `client_id` (id crescente).
- **Evidência:** `StatementTransformer.php` (`'date' => $model->created_at->format('Y-m-d')`), `StatementRepositoryEloquent::paginate`
- **Sonda:** `RN-EXT-001-a-004-…json`:
  - conta a receber paga com vencimento em 2018 → o lançamento aparece com `date` = **hoje**;
  - campos `id,date,value,balance,bank_account_id,bankAccount`;
  - conta bancária incluída.
- **Confiança:** alta

### RN-EXT-002 — `statement_data`: totais de TODOS os lançamentos do cliente (não da página)
- **Regra:**
  - `count` = número de lançamentos;
  - `revenues.total` = soma dos lançamentos de contas a **receber**;
  - `expenses.total` = soma (negativa) dos de contas a **pagar**;
  - tudo sobre o conjunto inteiro do cliente, independente de página e busca.
- **Tela:** mostra receitas, despesas, quantidade e "receitas + despesas".
- **Evidência:** `StatementRepositoryEloquent::formatStatementsData` / `getCountAndTotalByBill` (`selectRaw('COUNT(id) as count, SUM(value) as total')`
  por `statementable_type`)
- **Sonda:** `RN-EXT-001-a-004` → uma recebida de 12,34 gera `delta_count` 1, `delta_receitas` 12,34 e
  `delta_despesas` 0 ✅
- **Confiança:** alta

### RN-EXT-003 — A busca é IGNORADA — inclusive o período que a tela envia
- **Regra:**
  - a tela abre com `search=01/MM/AAAA - 30/MM/AAAA` (o mês corrente) e mostra esse período no campo de busca;
  - o repositório não declara `$fieldSearchable`, então o `RequestCriteria` ignora o `search`;
  - resultado: a lista e os totais trazem **todos** os lançamentos, de todas as datas.
- **Evidência:**
  - `StatementRepositoryEloquent.php` (sem `$fieldSearchable`);
  - `StatementList.vue:114,124-132` (`setFilter(\`${dateFilterStart()} - ${dateFilterEnd()}\`)`);
  - trafego-spa.md.
- **Sonda:** `RN-EXT-001-a-004` → com `search=01/01/2000 - 02/01/2000`, o total e os totais são iguais aos sem busca
  (`busca_por_periodo_ignorada: true`) ✅
- **Confiança:** alta · **Suspeita de bug?** **sim**: a tela promete o mês e mostra tudo (DUV-EXT-001)

### RN-EXT-004 — `?limit` é ignorado: 15 por página, sempre
- **Regra:** o `paginate()` sobrescrito chama `parent::paginate($limit = null)`, que usa o padrão da configuração (15).
  Diferente das contas bancárias, onde `limit` vira o `per_page`.
- **Evidência:** `StatementRepositoryEloquent::paginate` (`$limit = null`)
- **Sonda:** `RN-EXT-001-a-004` (`limit_5` → `per_page: 15`) ✅. O compat do sistema novo respeita o `limit`
  (`per_page: 5`): é uma divergência não intencional, embora o SPA não envie `limit` no extrato.
- **Confiança:** alta

### RN-EXT-005 — Ordenação: valor e saldo funcionam; Data e Conta dão 500
- **Regra:** a tela ordena por 4 cabeçalhos (`StatementList.vue:78-88`):

  | Cabeçalho | Chave enviada | Resultado |
  |---|---|---|
  | Data | `date` | **500**: coluna inexistente (a coluna é `created_at`) |
  | Conta | `bank_accounts:bank_account_id\|bank_accounts.name` (join do prettus) | **500**: o join funciona na lista, mas o mesmo critério entra na consulta dos totais, e `COUNT(id)` fica **ambíguo** (`SQLSTATE 23000, 1052`) |
  | Valor | `value` | ✅ |
  | Saldo | `balance` | ✅ |

  Qualquer coluna inexistente → 500. Qualquer coluna existente da tabela é aceita (sem allowlist). Com valores iguais,
  a ordem de desempate não é determinística no MySQL.
- **Evidência:** `laravel.log`:
  - `Unknown column 'date' in 'order clause'`;
  - `Column 'id' in field list is ambiguous (SQL: select statements.*, COUNT(id) as count … left join bank_accounts …)`.
- **Sonda:** `RN-EXT-005-ordenacao.json` (`por_data` 500, `por_conta` 500, `coluna_inexistente` 500; valor e saldo em
  ordem) ✅. O compat responde **422** nos três (allowlist `id, value, balance, bank_account_id`).
- **Confiança:** alta · **Suspeita de bug?** **sim**: metade dos cabeçalhos da tela quebra (DUV-EXT-002)

### RN-EXT-006 — Isolamento por cliente
- **Regra:** `Statement` usa `BelongsToTenants`: lista e totais só do cliente. O `include=bankAccount` segue a FK do
  lançamento, sem filtro próprio. O isolamento depende de o lançamento apontar para uma conta bancária do mesmo
  cliente, o que o ETL verifica ("Referências cruzadas entre clientes") e o módulo `contas` novo garante.
- **Sonda:** `RN-EXT-001-a-004` (`outro_cliente_intocado: true`); espelho com o cliente 3 ✅
- **Confiança:** alta

### RN-EXT-007 — Lançamentos órfãos continuam no extrato
- **Regra:** excluir uma conta paga não apaga nem estorna o lançamento (RN-CON-010). Ele continua listado e somado
  nos totais, com `statementable` apontando para uma conta que não existe mais.
- **Evidência:** RN-CON-010; ETL, seção "Extratos órfãos" (11 no oráculo local)
- **Paridade:** n/a (já coberta por `contas/RN-CON-010`); tratamento no sistema novo: E03
- **Confiança:** alta
