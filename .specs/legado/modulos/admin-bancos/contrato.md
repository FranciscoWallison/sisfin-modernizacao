# Contrato — módulo `admin-bancos` (AS-IS)

> HTML (Blade + Materialize), sessão e CSRF; gate `access-admin`. Sondas: `tools/sondas/admin-*.mjs`.

| Rota | Método | Quem | Efeito / resposta (com o link `admin → Admin` no oráculo) |
|---|---|---|---|
| `/admin/login` | GET / POST | visitante | Formulário `email`, `password`; sucesso → 302 `/admin/home` |
| `/admin/home` | GET | admin | Painel; usuário comum → 403 |
| `/admin/banks` | GET | admin | Lista paginada (5), com logo, "Editar" e "Excluir" (componente Vue que manda `DELETE`) |
| `/admin/banks/create` | GET | admin | Formulário `name`, `logo` (arquivo) |
| `/admin/banks` | POST (multipart) | admin | **Sempre 500** (`BankCreateRequest` inexistente) |
| `/admin/banks/{id}/edit` | GET | admin | Formulário preenchido |
| `/admin/banks/{id}` | PUT (multipart) | admin | **Sempre 500** (`BankUpdateRequest` inexistente) |
| `/admin/banks/{id}` | DELETE | admin | Sem uso: 302 → listagem. Em uso: **500** (FK) |
| `/admin/register` | GET / POST | **qualquer um** | Cria usuário `role = client`, `client_id = null` |
| `/admin/password/email` | POST | visitante | Envia e-mail com link **sem** `/admin` (404) |

Sem o link (Linux puro, como no repositório): todas as páginas do admin de bancos → 500 (RN-ADB-001).
