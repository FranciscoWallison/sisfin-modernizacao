# Dados do legado (MySQL 5.7)

> Levantado das migrations em `legacy/database/migrations/`. Completar com colunas, índices e FKs.

| Tabela | Tenant (`client_id`) | Observação |
|---|---|---|
| `clients` | — | O tenant |
| `users` | FK | `role` (admin/cliente) |
| `password_resets` | — | |
| `banks` | — | Dados e logo padrão criados **na própria migration** (`2017_09_03_*`) |
| `bank_accounts` | ✅ | `balance FLOAT` (RN-CON-011) |
| `category_expenses` / `category_revenues` | ✅ | Árvore via nested set (`_lft`, `_rgt`) |
| `bill_pays` / `bill_receives` | ✅ | `value FLOAT`, `done`, `date_due` |
| `statements` | ✅ | Polimórfica (`statementable_type`, `statementable_id`); `value`/`balance FLOAT` |
| `plans`, `subscriptions`, `orders` | — | Iugu |

Sem procedures, triggers ou views: toda regra está no PHP.
