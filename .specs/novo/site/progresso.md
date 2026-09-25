# Progresso — módulo `site` (cadastro e login)

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 9 regras (código, views, SPA, 5 sondas reproduzíveis em `tools/sondas/`) | Achados: convite sempre 500; assinatura nunca exigida; JWT na URL; cadastro fora de transação; e-mail sem diferenciar maiúsculas (RN-SIT-009, achado na S02) |
| TO-BE | ✅ | requirements, ADR-009, design e tasks aprovados (hash `af43e2de4789`) | |
| S01. DTO do cadastro | ✅ | `test/cadastro-dto.spec.ts` (10): as mensagens capturadas pelas sondas, `client.email` com formato, confirmação no campo `password` (como o Laravel), `role`/`client_id`/`client.code` → 422 | |
| S02. Serviço, repositório e rota | ✅ | `test/cadastro.integracao.spec.ts` (8): transação; corrida com capitalização diferente → um 201, um 422 e nenhum cliente órfão (**mutação** sem o índice `lower(email)`: 3/3 falham); token serve para `/api/user`; usuário novo vê listas vazias; `?token=` → 401; login com maiúsculas → 200 | Corrige no `auth-compat` o login que recusava maiúsculas (o legado aceita) |
| S03. Login e logout na tela | ✅ | E2E: senha errada mostra a mensagem da API; certa (com maiúsculas) → app; sair → token invalidado (401) | |
| S04. Front novo e Docker | ✅ | `web/` (Vue 3 + Vite + TS): vitest 12 (no build da imagem); E2E cadastro → `/app#!/dashboard` já logado, com o nome no menu. `docs/imgs/web-*.png` | O Playwright MCP travou (diálogo nativo do Chrome) → E2E versionado com `@playwright/test` 1.63 (o 1.52 trava com Node 24 + ESM) |
| S05. Sem token na URL e convite | ✅ | E2E: `/my-financial?token=…` termina sem `token=`; `Referrer-Policy`; log sem a query (conferido no `docker compose logs`); `/my-financial/invite` → "não encontrada" | |
| S06. Segurança e documentação | ✅ | `docs/revisoes/2026-09-25-security-site.md`: **1 alta que eu mesmo introduzi na S02 (ILIKE: login com `%` entrava como o usuário 1), pega antes do commit**; S2, S3, S4, S6, S7, S11 corrigidos, cada um com teste vermelho antes; sensor contra ILIKE | Pendências: CSP do `/app` (Vue 1 usa eval); `trust proxy` na implantação; confirmação de e-mail (produto) |

## Resultado do módulo

- Cadastro e login fora do Blade: API (`POST /api/register` e as rotas de auth existentes) + telas Vue 3 na mesma
  origem do app.
- A API do legado inteira está no sistema novo, exceto o webhook da Iugu; do site Blade sobram as assinaturas e o
  admin de bancos.
