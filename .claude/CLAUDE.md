# sisfin-modernizacao

Reescrita do SisFin (sistema financeiro multi-tenant do TCC) guiada por especificação.
Processo: engenharia reversa (AS-IS) → spec (TO-BE) → implementação por tasks → paridade.

## Stacks
- LEGADO — **oráculo, somente leitura**: `legacy/` (git subtree de FranciscoWallison/Laravel-Vue.js).
  Laravel 5.3.18 · PHP 7.1 · MySQL 5.7 · Vue 1 · Gulp/Elixir · JWT (tymon) · multi-tenant (landlord) · Iugu · Pusher.
  Roda com `docker compose up -d` em http://localhost:8081 (usuários do seed: `clienteN@user.com` / `secret`).
- NOVO: NestJS + Prisma + PostgreSQL em `api/`; Vue 3 + Vite + Pinia em `web/` (ver `.specs/decisoes/`).

## Regras do processo
1. Nunca edite `legacy/`. Para investigar, leia o código ou faça uma SONDA via HTTP/MySQL no container.
2. Toda regra tem ID estável `RN-<MOD>-NNN` em `.specs/legado/modulos/<mod>/regras.md`. IDs nunca são renumerados.
3. Toda dúvida tem ID `DUV-<MOD>-NNN`, dono e status em `duvidas.md`.
4. Afirmação sobre o legado sem `legacy/<arquivo>:<linha>` (ou sonda reproduzível) é hipótese → vai para `duvidas.md`.
5. Todo requisito em `.specs/novo/` tem `Origem: RN-...` (ou `Origem: nova`) e `Decisão: manter | corrigir | descartar`.
6. Não implemente task de um `tasks.md` que não esteja com `Status: aprovado`.
7. Regra migrada = caso de paridade em `.specs/paridade/<mod>/` passando contra o legado E contra o novo.
8. Decisão de corrigir/descartar comportamento do legado vira ADR em `.specs/decisoes/`.
9. Rode `node tools/rastreabilidade.mjs` antes de abrir PR: não pode haver regra sem requisito nem requisito sem teste.

## Módulos (ordem de migração)
1. `contas` — contas a pagar/receber, repetição, saldo da conta bancária, extrato
2. `categorias` — árvore de despesas/receitas (nested set)
3. `contas-bancarias` e `bancos`
4. `fluxo-de-caixa`
5. `assinaturas` — planos, Iugu, webhooks
6. `auth` — JWT access/refresh, admin
