# Tráfego real do SPA (AS-IS)

> Capturado em 25/09/2026 com Playwright, navegando por cada tela do SPA do legado (`http://localhost:8082/app`, API
> `:8081`) e registrando as chamadas à API. É o contrato **que o front realmente usa** — com os parâmetros que um
> contrato escrito à mão deixa passar. `tools/espelho.mjs` usa estas URLs.

| Tela | Chamadas |
|---|---|
| `#!/dashboard` | `GET /api/bank_accounts?page=1&orderBy=balance&sortedBy=desc&search=&include=bank&limit=5` · `GET /api/cash_flows/monthly` · `GET /api/bill_receives/total_rest_of_month` · `GET /api/bill_receives/total_today` · `GET /api/bill_pays/total_rest_of_month` · `GET /api/bill_pays/total_today` · `GET /api/user` |
| `#!/bank-account` | (mesma listagem do dashboard, em cache) |
| `#!/plan-account` | `GET /api/category_revenues` · `GET /api/category_expenses` |
| `#!/bill-pay` | `GET /api/bill_pays?page=1&orderBy=id&sortedBy=asc&search=&include=category,bankAccount` · `GET /api/bank_accounts/lists` |
| `#!/bill-receive` | `GET /api/bill_receives?page=1&orderBy=id&sortedBy=asc&search=&include=category,bankAccount` |
| `#!/cash-flow` | `GET /api/cash_flows` |
| `#!/statement` | `GET /api/statements?page=1&orderBy=id&sortedBy=asc&search=01/09/2026 - 30/09/2026&include=bankAccount` |
| `#!/bank-account/create` | `GET /api/banks` |
| `#!/bank-account/{id}/update` | `GET /api/banks` · `GET /api/bank_accounts/{id}?include=bank` (lido do código: `BankAccountUpdate.vue:52-60`; achado na B01) |

## Comportamentos que o contrato escrito não tinha

| Parâmetro | Efeito no legado |
|---|---|
| `limit=N` | Vira o `per_page` (padrão 15) |
| `include=bank` (contas bancárias) | Cada item ganha `bank: { data: { id, name, logo: "<host>/storage/banks/imagens/<arquivo>", created_at, updated_at } }` |
| `include=bankAccount` (extrato) | Cada item ganha `bankAccount: { data: { …conta bancária… } }` |
| `include=category,bankAccount` (contas) | A mapear na T14 |
| `search=` em contas bancárias | `LIKE %texto%` em `name`, `agency`, `account` e `bank.name` (OU) |
| `search=` no extrato | **Sem efeito**: o repositório de extrato não declara campos pesquisáveis — o período que a tela envia é ignorado |
| Links de paginação | O `page` sai da posição original e vai para o **fim** da query: `…&limit=5&page=2` |

## Fora do módulo `contas` (a tela nova mostra erro até serem migrados)

`/api/cash_flows`, `/api/cash_flows/monthly` (fluxo-de-caixa), `/api/banks` (bancos). Logos de banco em `/storage/…`
também não carregam — nem no legado em container (falta o `storage:link`), nem no novo.
