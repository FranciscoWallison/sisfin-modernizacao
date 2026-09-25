Status: aprovado · Aprovado por: Francisco · Em: 2026-09-25 · Hash: af43e2de4789

# Tasks — módulo `site` (cadastro e login)

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs site "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **S01. DTO do cadastro** — campos, regras e as mensagens capturadas pelas sondas; `client.email` com formato; confirmação de senha. Aceite: testes unitários com as 9 mensagens do contrato. **REQ-SIT-02**.
- [ ] **S02. Serviço, repositório e rota** — `POST /api/register` público, com rate limit; transação cliente → usuário (bcrypt, role client); token pelo emissor existente; exceção de tenant documentada no depcruise. Aceite: integração (transação, corrida de e-mail, token serve para `/api/user`, usuário novo vê listas vazias). **REQ-SIT-01, REQ-SIT-02, REQ-SIT-03**.
- [ ] **S03. Login e logout na tela** — `web/` usa `/api/access_token` e `/api/logout`; mensagem de erro da API na tela. Aceite: Playwright (errado → mensagem; certo → `/app`; sair → token invalidado). **REQ-SIT-04**.
- [ ] **S04. Front novo e Docker** — `web/` (Vue 3 + Vite + TS, vitest) com `/`, `/login`, `/register`, `/my-financial`; estágios `web-build` e `servidor-novo`; `nginx-novo.conf`. Aceite: Playwright (cadastro → `/app` logado com dashboard; erros por campo). **REQ-SIT-01, REQ-SIT-05**.
- [ ] **S05. Sem token na URL e convite** — `/my-financial` apaga o `?token=`; `Referrer-Policy`; log sem query; `/my-financial/invite` inexistente. Aceite: Playwright (URL final sem `token=`; página "não encontrada"); `curl` do cabeçalho; integração (`?token=` → 401). **REQ-SIT-06, REQ-SIT-07**.
- [ ] **S06. Segurança e documentação** — `security-reviewer` (cadastro público, rate limit, exceção de tenant, front); achados viram testes que falham antes da correção; progresso, diário, README, inventário. **REQ-SIT-06**.
