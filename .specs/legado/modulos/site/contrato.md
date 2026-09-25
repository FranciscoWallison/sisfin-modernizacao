# Contrato — módulo `site` (AS-IS)

> O site do legado é **HTML** (Blade + Materialize), com sessão e CSRF. O "contrato" é o que o navegador vê:
> formulários, redirecionamentos e mensagens (no atributo `data-error`). Sondas: `tools/sondas/site-*.mjs`.

| Rota | Método | Autenticação | Efeito / resposta |
|---|---|---|---|
| `/` | GET | — | Página inicial do site |
| `/register` | GET | — | Formulário: `name`, `email`, `password`, `password_confirmation`, `client[name]`, `client[email]` |
| `/register` | POST | CSRF | Sucesso: cria cliente + usuário, abre a sessão, **302 → `/subscriptions/create`**. Erro: 302 → `/register` com mensagens |
| `/login` | GET | — | Formulário: `email`, `password`, `remember` |
| `/login` | POST | CSRF | Sucesso: **302 → `/`**. Erro: 302 → `/login` ("These credentials do not match our records."; da 6ª em diante, "Too many login attempts. Please try again in 60 seconds.") |
| `/logout` | POST | CSRF + sessão | **302 → `/login`** |
| `/my-financial?token=<JWT>` | GET | JWT na URL → sessão | "oi" |
| `/my-financial/invite` | GET / POST | sessão | GET: formulário igual ao cadastro. POST: **sempre 500** (RN-SIT-006) |
| `/app` | GET | — | O SPA (Vue 1), que faz login pela API (`POST /api/access_token`) e guarda o JWT em `localStorage['token']` |

Mensagens de validação do cadastro (sonda de 25/09):

```text
The name field is required.            The email field is required.         The password field is required.
The client.name field is required.     The client.email field is required.  The email has already been taken.
The email must be a valid email address.
The password must be at least 6 characters.   The password may not be greater than 20 characters.
```
