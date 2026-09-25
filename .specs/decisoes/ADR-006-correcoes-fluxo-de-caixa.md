# ADR-006 — Comportamentos do legado corrigidos no módulo `fluxo-de-caixa`

- **Status:** aceito — aprovado — Francisco, 25/09/2026 (com o plano, hash e486869c0978)
- **Data:** 25/09/2026

## Contexto

O levantamento (`.specs/legado/modulos/fluxo-de-caixa/`) mostrou que a tela de fluxo de caixa do legado está
**sempre vazia** com dados atuais: a janela está fixa em 2018 no código (RN-FLX-002). A tela, por sua vez, calcula
o "primeiro mês" como o mês anterior a hoje — ou seja, o front espera a janela a partir do mês atual.
Também foram provados por sonda: o "primeiro mês" só considera o último dia (RN-FLX-004) e o corte do saldo anterior
exclui o último dia (RN-FLX-006). O isolamento depende da integridade da árvore de categorias (RN-FLX-007).

## Decisão

| Regra | Legado | Sistema novo | Dúvida |
|---|---|---|---|
| RN-FLX-002 | Janela fixa fev–dez/2018 | Início = mês atual (UTC), +10 meses; `?start=aaaa-mm` opcional | DUV-FLX-001 |
| RN-FLX-004 | "Primeiro mês" = só o último dia | Mês anterior inteiro, só pagas | DUV-FLX-002 |
| RN-FLX-006 | Corte `<= 'aaaa-mm-dd'` (00:00) | `< primeiro dia do mês seguinte` | DUV-FLX-003 |
| RN-FLX-007 | `client_id` só na raiz | `client_id` na raiz, nas filhas e nas contas | DUV-FLX-004 |

## Consequências

- Casos de paridade ganham `divergencias` referindo este ADR:
  `RN-FLX-002-janela-padrao.json` (`mes_atual_na_janela: true`, `janela_de_2018: false`) e
  `RN-FLX-003-a-007-janela-2018.json` (`primeiro_mes_receitas_delta: 15`).
- `?start=` é uma **adição** ao contrato (o SPA não envia; o legado ignora) — permite comparar os dois sistemas na
  mesma janela e, no futuro, navegar entre meses.
- O espelho de leitura passa a incluir `/api/cash_flows/monthly` (sem divergência). `/api/cash_flows` fica de fora
  do espelho: diverge por decisão.

## Notas de implementação (divergências técnicas conhecidas, sem efeito com dados íntegros)

- **Raiz = `parent_id IS NULL`** em vez da "profundidade 0" calculada pelo nested set. Equivalência testada no banco
  migrado para despesas e receitas (`test/fluxo.integracao.spec.ts`).
- **Ordenação `period, lower(name), name, id`** em vez da collation `utf8_unicode_ci` do MySQL (que também ignora
  acentos). Pode mudar a ordem de nomes acentuados e, com a RN-FLX-008 (dedup por nome), qual categoria homônima
  aparece — o `id` por último torna o resultado estável. Resolvido de vez se a DUV-FLX-005 for aprovada (agrupar por id).
- **Saldo anterior** também exige que a conta bancária seja do cliente (revisão de segurança do módulo).
