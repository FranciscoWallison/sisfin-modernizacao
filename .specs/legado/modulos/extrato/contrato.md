# Contrato HTTP — módulo `extrato` (AS-IS)

> Capturado do oráculo em 25/09/2026. Consumido por `#!/statement` (`StatementList.vue`). Exige autenticação.

**Pedido real da tela** (trafego-spa.md): `GET /api/statements?page=1&orderBy=id&sortedBy=asc&search=01/09/2026 - 30/09/2026&include=bankAccount`

```json
{
  "data": {
    "statements": {
      "data": [
        { "id": 4, "date": "2026-09-25", "value": -317, "balance": -317, "bank_account_id": 26,
          "bankAccount": { "data": { "id": 26, "name": "Botsfordtown", "agency": "54587-8", "account": "97897-5", "balance": -1027,
                                     "default": false, "bank_id": 2, "created_at": { "…": "…" }, "updated_at": { "…": "…" } } } }
      ],
      "meta": { "pagination": { "total": 203, "count": 15, "per_page": 15, "current_page": 1, "total_pages": 14,
                                "links": { "next": "http://localhost:8081/api/statements?orderBy=id&sortedBy=asc&search=&include=bankAccount&page=2" } } }
    },
    "statement_data": { "count": 203, "revenues": { "total": 8734.68 }, "expenses": { "total": -13206 } }
  }
}
```

- `value` negativo = saída (conta a pagar); `balance` = saldo da conta bancária depois do lançamento.
- Paginação no formato Fractal/Laravel (a mesma das outras listas; o `page` vai para o fim dos links).
- Erros:
  - `orderBy=date`, `orderBy=<join de conta>` ou coluna inexistente → **500** (HTML de erro do Laravel);
  - sem token → 401.
