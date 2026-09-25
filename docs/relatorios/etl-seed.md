# Relatório do ETL — legado (MySQL) → sistema novo (PostgreSQL)

- Gerado em: 2026-09-25T03:16:26.584Z por `tools/migrar-dados.mjs` (dados do **seed fictício**)
- Resultado: ✅ contagens iguais em todas as tabelas
- Só ids e valores; nenhum dado pessoal (revisão de segurança #12).

## Contagens

| tabela | origem | destino |
|---|---|---|
| clients | 5 | 5 |
| users | 51 | 51 |
| banks | 3 | 3 |
| bank_accounts | 50 | 50 |
| category_expenses | 120 | 120 |
| category_revenues | 120 | 120 |
| bill_pays | 200 | 200 |
| bill_receives | 200 | 200 |
| statements | 186 | 186 |

## Arredondamentos DOUBLE(8,2) → DECIMAL(12,2) (RN-CON-011)

0 valor(es) mudaram ao arredondar para centavos.
_nenhum_

## Saldo × soma do extrato por conta bancária (DUV-CON-005)

Saldos migrados **como estão** (ADR-003). 0 conta(s) com saldo ≠ soma do extrato.
_nenhum_

## Extratos órfãos (conta de origem excluída — RN-CON-010)

0 extrato(s) mantidos (histórico preservado, REQ-CON-09).
_nenhum_

## Usuários sem cliente (RN-CON-019)

_nenhum_

## Tipos de extrato não reconhecidos

_nenhum_
