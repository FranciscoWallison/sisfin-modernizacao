# ADR-001 — Legado como oráculo em subtree + stack de destino

- **Status:** aceito
- **Data:** 24/09/2026

## Contexto

O SisFin (TCC, 2017) roda em Laravel 5.3.18 / PHP 5.6–7.1 / Vue 1 / Gulp + Node 6. As dependências estão em fim de vida,
o deploy (Heroku) morreu e o único teste é o `ExampleTest.php`. O objetivo é reescrever com agentes de IA, guiado por
especificação, e **provar** que o comportamento foi preservado — ou alterado de propósito.

## Decisão

1. **O legado entra em `legacy/` via `git subtree`** (histórico preservado), é somente leitura (`.claude/settings.json`
   nega edição) e roda em Docker (`docker-compose.yml`, PHP 7.1 + MySQL 5.7) como **oráculo** das sondas e do golden master.
   O repositório original `Laravel-Vue.js` continua intacto.
2. **Destino:** NestJS + Prisma + PostgreSQL (`api/`) e Vue 3 + Vite + Pinia (`web/`).
   - A API reaproveita o padrão de `back-app-parceiro` (JWT access/refresh com revogação).
   - Vue 3 mantém o paradigma declarativo do front antigo: a paridade fica no comportamento, não na troca de paradigma.
3. **Contrato da API compatível** com o legado por padrão (mesmas rotas e formatos), para permitir Strangler Fig
   e reaproveitar os casos de paridade. Quebras de contrato exigem ADR próprio.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Upgrade in-place para Laravel 11 | Mais barato, mas a mesma linguagem esconde as regras — o case perde o valor da spec como ponte |
| Fork do `Laravel-Vue.js` | Mistura o registro histórico do TCC com a reescrita |

## Consequências

- Rodar o oráculo exige Docker; os dados do seed são aleatórios (DUV-CON-007).
- Toda regra migrada precisa de caso em `.specs/paridade/`.
