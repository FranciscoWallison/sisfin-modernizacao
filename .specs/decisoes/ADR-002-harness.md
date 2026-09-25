# ADR-002 — Harness de engenharia antes do código novo

- **Status:** aceito
- **Data:** 25/09/2026

## Contexto

A implementação do TO-BE será feita majoritariamente por agentes. Sem restrições e ciclos de feedback,
o custo de revisão humana cresce com o volume de código gerado, e erros de comportamento só apareceriam no cutover.

## Decisão

Construir o harness **antes** do primeiro módulo novo, priorizando sensores **computacionais** (baratos, determinísticos):
golden master contra o oráculo, observabilidade de SQL do oráculo, rastreabilidade, hooks de pré/pós-edição,
aprovação de plano amarrada a hash e CI. Sensores de arquitetura (camadas, tenant) entram junto com o `design.md`.
Detalhes e análise de viabilidade: [`docs/harness.md`](../../docs/harness.md).

## Consequências

- Todo caso de paridade roda contra legado **e** novo (`--base`), então o golden master é o critério de aceite das tasks.
- Divergência intencional exige ADR e recaptura explícita; editar o `esperado` à mão é proibido.
- Os hooks não são fronteira de segurança (Bash passa por fora); o CI é o gate.
- O próprio harness tem testes (`tools/testes/harness.test.mjs`) e roda no CI.
