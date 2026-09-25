# Contrato HTTP — módulo `contas` e dependências (AS-IS)

> Capturado do oráculo em 25/09/2026 (`curl` + `tools/oraculo-sql.mjs`). O sistema novo mantém este contrato (ADR-001),
> exceto onde um ADR diz o contrário. Arrays abaixo mostram só o 1º item.

## Autenticação

| Requisição | Resposta |
|---|---|
| `POST /api/access_token` `{email, password}` | **200** `{"token": "<JWT HS256>"}` — TTL 60 min (`legacy/config/jwt.php:103`) |
| credenciais erradas | **400** `{"message": "These credentials do not match our records."}` |
| campos faltando | **422** `{"email": ["The email field is required."], "password": ["The password field is required."]}` |
| rota protegida sem token, com token inválido ou após logout | **401** `{"error": "Unauthenticated."}` |
| `POST /api/logout` | **204**; o mesmo token depois → 401 (blacklist) |
| `GET /api/user` | **200** `{"id", "name", "email", "created_at": "2026-09-25 03:16:12", "updated_at", "role", "client_id", "client": {"id", "name", "email", "code", "created_at", "updated_at"}}` — sem `password`/`remember_token` (datas em texto simples, não Carbon) |
| `POST /api/refresh_token` | `{"token"}` (módulo `auth`) |

Senhas: bcrypt do Laravel (`$2y$10$…`).

## Contas (`/api/bill_pays` e `/api/bill_receives` — mesma estrutura)

**`GET /api/bill_pays?search=&page=1&orderBy=id&sortedBy=asc`** (o SPA sempre envia esses parâmetros — `legacy/resources/assets/spa/js/services/search-options.js`)

```json
{ "data": {
    "bills": {
      "data": [ { "id": 201, "date_due": "2027-01-31", "name": "…", "value": 10, "done": false,
                  "category_id": 7, "bank_account_id": 4, "created_at": {…}, "updated_at": {…} } ],
      "meta": { "pagination": { "total": 0, "count": 0, "per_page": 15, "current_page": 1, "total_pages": 0, "links": [] } }
    },
    "bill_data": { "total_paid": 0, "total_to_pay": 0, "total_expired": 0 } } }
```

| Requisição | Resposta |
|---|---|
| `POST` (corpo: `name, date_due, value, done, category_id, bank_account_id, repeat?, repeat_number?, repeat_type?`) | **201** `{"data": {conta}}` |
| `GET /{id}` | **200** `{"data": {conta}}` · **404** se de outro cliente |
| `PUT /{id}` | **200** `{"data": {conta}}` |
| `DELETE /{id}` | **204** `[]` |
| `GET /total_today`, `GET /total_rest_of_month` | **200** `{"total": 903}` |
| validação | **422** `{"campo": ["mensagem"]}` (formato Laravel) |

Datas de auditoria no formato do Carbon serializado: `{"date": "2026-09-24 22:00:27.000000", "timezone_type": 3, "timezone": "UTC"}`.

## Dependências usadas pelo módulo (e pelos casos de paridade)

**`GET /api/bank_accounts`** → `{"data": [{"id", "name", "agency", "account", "balance", "default", "bank_id", "created_at", "updated_at"}], "meta": {"pagination": {…}}}`
**`GET /api/bank_accounts/{id}`** → `{"data": {…mesmos campos}}`
**`GET /api/bank_accounts/lists`** → `[{"id", "name", "account"}]` (sem envelope)
**`GET /api/category_expenses`** → `{"data": [{"id", "name", "parent_id", "depth", "created_at", "updated_at", "children": {"data": [ … recursivo … ]}}]}`
**`GET /api/statements?orderBy=id&sortedBy=desc`** →

```json
{ "data": {
    "statements": { "data": [ { "id": 4, "date": "2026-09-24", "value": -317, "balance": -317, "bank_account_id": 26 } ],
                    "meta": { "pagination": { … , "links": { "next": "…?page=2" } } } },
    "statement_data": { "count": 134, "revenues": { "total": 8235 }, "expenses": { "total": -13114 } } } }
```
