# Contrato HTTP — módulo `categorias` (escrita) — AS-IS

> Capturado do oráculo em 25/09/2026. Consumido pela tela `#!/plan-account` (plano de contas, modais de criar/editar/
> excluir). Mesmo contrato para `/api/category_revenues` e `/api/category_expenses`. Todas as rotas exigem
> autenticação. A listagem (`GET /api/category_*`) já está no sistema novo (`api/src/compat/`).

| Método e rota | Corpo enviado pela tela | Sucesso | Erros observados |
|---|---|---|---|
| `GET /api/category_*/{id}` | — | 200 | 404 `{"message":"Resource not Found"}` (inexistente ou de outro cliente) |
| `POST /api/category_*` | `{ "id": 0, "name": "…", "parent_id": 5 }` (sem `parent_id` para raiz) | 201 | 422 (`name`, `parent_id`) |
| `PUT /api/category_*/{id}` | `{ "id": 43, "name": "…", "parent_id": 5 }` (sem `parent_id` → vira raiz) | 200 | 422; **404 com escrita feita** se a categoria é de outro cliente (RN-CAT-003); 500 em ciclo |
| `DELETE /api/category_*/{id}` | — | 204 `[]` | 404 (outro cliente); 500 com contas (RN-CAT-005 / RN-CAT-009) |

**Resposta de `GET`/`POST`/`PUT`** (o mesmo transformer da árvore):

```json
{
  "data": {
    "id": 121, "name": "PAR-FORMATO", "parent_id": null, "depth": 0,
    "created_at": { "date": "2026-09-25 13:18:31.000000", "timezone_type": 3, "timezone": "UTC" },
    "updated_at": { "date": "2026-09-25 13:18:31.000000", "timezone_type": 3, "timezone": "UTC" },
    "children": { "data": [ { "id": 43, "parent_id": 121, "depth": 1, "…": "…", "children": { "data": [] } } ] }
  }
}
```

**Erro de validação** (422, formato do Laravel 5.3 — sem envelope `errors`):

```json
{ "name": ["The name field is required."] }
{ "parent_id": ["The selected parent id is invalid."] }
```

Notas:
- `depth` é a profundidade no nested set (raiz = 0) — o sistema novo calcula pela árvore, como no compat.
- `DELETE` responde `204` com corpo `[]` no legado (`response()->json([],204)`); o cliente HTTP descarta o corpo.
