# sisfin-modernizacao

Case de **modernização de legado guiada por especificação (Spec-Driven Development) com agentes de IA**.

O sistema reescrito é o **SisFin**, sistema financeiro multi-tenant do meu TCC (2017): contas a pagar e receber,
contas bancárias, extrato, fluxo de caixa e assinaturas via Iugu, em Laravel 5.3 + Vue 1.
Ele é reescrito em NestJS + Vue 3, e cada regra de negócio precisa **provar** que foi preservada (ou mudada de propósito).

> Inspirado na [migração do app Shop da Shopify](https://shopify.engineering/shop-app-migration):
> o sistema antigo é o **oráculo**, os agentes documentam e implementam, e a paridade é verificada automaticamente.

## Como funciona

```text
legacy/ (oráculo, só leitura)
   │  engenharia reversa + sondas
   ▼
.specs/legado/   regras RN-* com arquivo:linha · dúvidas DUV-*
   │  decisão: manter | corrigir | descartar
   ▼
.specs/novo/     requirements (EARS) → design → tasks
   │  implementação por tasks
   ▼
api/ + web/      ◄── .specs/paridade/ (golden master capturado do legado)
```

| Pasta | O quê |
|---|---|
| `legacy/` | [Laravel-Vue.js](https://github.com/FranciscoWallison/Laravel-Vue.js) via `git subtree` — **nunca editado** |
| `.claude/` | Processo para o Claude Code: `CLAUDE.md`, comandos (`/mapear-modulo`, `/extrair-regras`, `/capturar-paridade`, `/spec-nova`) e subagentes (`arqueologo`, `security-reviewer`) |
| `.specs/legado/` | AS-IS: inventário, dados, comportamento, regras e dúvidas por módulo |
| `.specs/novo/` | TO-BE: requirements, design e tasks por módulo |
| `.specs/paridade/` | Casos golden master executados contra o legado |
| `.specs/decisoes/` | ADRs |
| `tools/rastreabilidade.mjs` | Matriz RN → REQ → Task → Paridade e detecção de órfãos |

## Rodando o oráculo

```bash
docker compose up -d --build     # PHP 7.1 + MySQL 5.7; migra e popula na primeira subida
curl -X POST http://localhost:8081/api/access_token \
  -H "Content-Type: application/json" \
  -d '{"email":"cliente1@user.com","password":"secret"}'
```

- App: http://localhost:8081 · MySQL: `localhost:33061` (`sisfin`/`sisfin`)
- Resetar os dados: `docker compose down -v && docker compose up -d`

## Progresso

| Módulo | AS-IS | Paridade | TO-BE | Implementado |
|---|---|---|---|---|
| contas | 🟡 12 regras, 7 dúvidas | 🟡 1 caso | ⚪ | ⚪ |
| categorias · contas-bancarias · bancos · fluxo-de-caixa · assinaturas · auth | ⚪ | ⚪ | ⚪ | ⚪ |

### Achados até agora (pelas sondas no oráculo)

- **RN-CON-009** — mover uma conta paga para outra conta bancária não move o saldo.
- **RN-CON-010** — excluir uma conta paga não estorna o saldo e deixa extrato órfão.
- **RN-CON-011** — dinheiro armazenado em `FLOAT`.
- **RN-CON-012** — `->defalt(false)` numa migration: erro de digitação que o Laravel 5.3 aceitou em silêncio.
