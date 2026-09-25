# Contrato HTTP — módulo `fluxo-de-caixa` (AS-IS)

> Capturado do oráculo em 25/09/2026. Consumido pela tela `#!/cash-flow` e pelo gráfico do `#!/dashboard`
> (`.specs/legado/trafego-spa.md`). Ambas as rotas exigem autenticação e são restritas ao cliente.

**`GET /api/cash_flows`** (sem parâmetros na tela)

```json
{
  "period_list": [
    { "period": "2018-01", "revenues": { "total": 20 }, "expenses": { "total": 0 } },
    { "period": "2018-03", "revenues": { "total": 0 },  "expenses": { "total": 136 } }
  ],
  "balance_before_first_month": 0,
  "categories_period": {
    "expenses": { "data": [ { "id": 5, "name": "…", "periods": [ { "total": 136, "period": "2018-03" } ] } ] },
    "revenues": { "data": [ { "id": 6, "name": "…", "periods": [ { "total": 20, "period": "2018-01" }, { "total": 12, "period": "2018-12" } ] } ] }
  }
}
```

- `period_list`: só meses **com** movimento, ordenados; inclui o "primeiro mês" (mês anterior ao início) se houver realizado.
- `categories_period`: categorias **raiz**; `periods` com `total` e `period` (nessa ordem de chaves).
- Valores como número JSON.

**`GET /api/cash_flows/monthly`**

```json
{ "period_list": [ { "period": "2026-09-25", "revenues": { "total": 0 }, "expenses": { "total": 903 } } ] }
```
