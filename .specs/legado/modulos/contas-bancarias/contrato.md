# Contrato HTTP — módulo `contas-bancarias` (escrita + bancos) — AS-IS

> Capturado do oráculo em 25/09/2026. Consumido por `#!/bank-account/create` e `#!/bank-account/{id}/update`
> (`.specs/legado/trafego-spa.md`) e pela exclusão na listagem. Todas as rotas exigem autenticação.
> As leituras (`GET /api/bank_accounts`, `/lists`, `/{id}`) já estão no sistema novo (`api/src/compat/`).

| Método e rota | Corpo enviado pela tela | Sucesso | Erros observados |
|---|---|---|---|
| `GET /api/banks` | — | 200 (lista global, sem paginação) | — |
| `POST /api/bank_accounts` | `{ "name", "agency", "account", "bank_id", "default" }` (`bank_id: ''` se não escolheu) | 201 | 422; 500 com `bank_id` inexistente |
| `PUT /api/bank_accounts/{id}` | o **objeto inteiro** do `GET …?include=bank` (inclui `id`, `balance`, datas, `bank`) | 200 | 422 (todos os campos obrigatórios); 404 (outro cliente); 500 com `bank_id` inexistente |
| `DELETE /api/bank_accounts/{id}` | — | 204 | 404 (outro cliente); 500 com lançamentos |

**`POST`/`PUT` → resposta**

```json
{ "data": { "id": 67, "name": "PAR-FORMATO", "agency": "1", "account": "2", "balance": 0, "default": false, "bank_id": 1,
  "created_at": { "date": "2026-09-25 13:18:31.000000", "timezone_type": 3, "timezone": "UTC" },
  "updated_at": { "date": "2026-09-25 13:18:31.000000", "timezone_type": 3, "timezone": "UTC" } } }
```

**`GET /api/banks`**

```json
{ "data": [ { "id": 1, "name": "Novo Banco",
  "logo": "http://localhost:8081/storage/banks/imagens/68c55efdd615dac5e1b92160d296e2f8.jpeg",
  "created_at": { "date": "…", "timezone_type": 3, "timezone": "UTC" }, "updated_at": { "…": "…" } } ] }
```

**422** (formato do Laravel 5.3, sem envelope):

```json
{ "name": ["The name field is required."], "agency": ["The agency field is required."],
  "account": ["The account field is required."], "bank_id": ["The bank id field is required."] }
```
