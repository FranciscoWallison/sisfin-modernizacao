# ADR-003 — Comportamentos do legado corrigidos no módulo `contas`

- **Status:** proposto — aguardando aprovação do Francisco
- **Data:** 25/09/2026

## Contexto

As sondas no oráculo confirmaram comportamentos do legado que parecem bugs (RN-CON-006, 007, 009, 010, 011, 013, 015)
e uma ambiguidade de produto (RN-CON-001). Reescrever com paridade cega migraria os bugs; corrigir sem registro
faria o golden master falhar sem explicação.

## Decisão (proposta)

| Regra | Legado | Sistema novo | Dúvida |
|---|---|---|---|
| RN-CON-001 | "Repetir N" cria N+1 contas | **Manter** (a tela deve dizer "+N repetições") | DUV-CON-001 |
| RN-CON-006 | Repetições de conta criada paga nascem pagas e debitam tudo | Só a conta informada nasce paga | DUV-CON-002 |
| RN-CON-007 | Conta e extrato fora da transação do saldo | Tudo na mesma transação | — |
| RN-CON-009 | Mover conta paga não move o saldo | Estorna na antiga, debita na nova, 2 extratos | DUV-CON-003 |
| RN-CON-010 | Excluir conta paga não estorna | Estorna + extrato de estorno; histórico preservado | DUV-CON-004 |
| RN-CON-011 | Dinheiro em `FLOAT` | `DECIMAL(12,2)` | — |
| RN-CON-012 | `done` sem default em `bill_pays` | Default `false` nas duas tabelas | — |
| RN-CON-013 | Sem categoria/conta → 500 | 422 | — |
| RN-CON-015 | Valor negativo aceito | 422 para valor ≤ 0 | DUV-CON-008 |

## Consequências

- Cada correção vira um bloco `divergencias` no caso de paridade correspondente, com o resultado esperado no sistema
  novo e referência a este ADR. O `esperado` do legado não muda.
- **Migração de dados:** contas pagas já excluídas deixaram extratos órfãos e saldos sem estorno (RN-CON-010);
  contas pagas movidas deixaram saldos na conta errada (RN-CON-009). O `design.md` define se os saldos migram
  como estão (recomendado: migrar como estão e registrar a divergência) ou se são recalculados a partir do extrato.
