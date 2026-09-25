# ADR-008 — Comportamentos do legado corrigidos no módulo `extrato`

- **Status:** aceito — aprovado — Francisco, 25/09/2026 (com o plano, hash fa8f9227d732)
- **Data:** 25/09/2026

## Contexto

O levantamento (`.specs/legado/modulos/extrato/`) mostrou, com sondas e com o `laravel.log`, que a tela de extrato do
legado promete o que não faz:

- **O campo de busca abre com o mês corrente** (`01/09/2026 - 30/09/2026`), mas a busca é ignorada. A lista e os totais
  trazem todos os lançamentos de todas as datas (RN-EXT-003).
- **Dois dos quatro cabeçalhos ordenáveis dão 500** (RN-EXT-005):
  - Data: a chave `date` não é coluna;
  - Conta: o join funciona na lista, mas quebra a consulta dos totais (`COUNT(id)` ambíguo).

O resto já é fiel no compat do sistema novo (T08): campos, data do lançamento, totais sobre o conjunto inteiro e
isolamento.

## Decisão

| Regra | Legado | Sistema novo | Dúvida |
|---|---|---|---|
| RN-EXT-003 | `search` ignorado | Período no formato da tela (`dd/mm/aaaa - dd/mm/aaaa`) filtra **lista e totais** pela data do lançamento. Busca sem período continua sem efeito | DUV-EXT-001 |
| RN-EXT-005 | `orderBy=date` e ordenar por conta → 500; coluna inexistente → 500 | `date` → data do lançamento; chave de conta da tela → nome da conta bancária (desempate por id); fora da allowlist → 422 | DUV-EXT-002 |

**Mantidos de propósito:**
- `?limit` ignorado, com 15 por página (RN-EXT-004 / DUV-EXT-003). O compat atual, que respeita `limit`, passa a ser fiel;
- data = dia do lançamento (RN-EXT-001);
- lançamentos órfãos continuam listados (RN-EXT-007).

## Consequências

- **Casos de paridade.** Ganham `divergencias` referindo este ADR:
  - `RN-EXT-001-a-004` (`busca_por_periodo_ignorada: false`, `periodo_sem_lancamentos_zera_lista_e_totais: true`);
  - `RN-EXT-005` (Data e Conta → 200; coluna inexistente → 422).
- **Efeito visível na tela:** ao abrir, o extrato mostra **só o mês corrente**, e os totais passam a ser os do mês.
- **Espelho de leitura:** as 3 URLs do extrato continuam iguais, porque não mandam período. A URL real da tela (com o
  período do mês) sai do espelho, porque diverge por decisão.
