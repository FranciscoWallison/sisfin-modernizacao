# Revisão de segurança — módulo `fluxo-de-caixa` (código) · 25/09/2026

- **Sensor:** subagente `security-reviewer` (só leitura) sobre `api/src/modules/fluxo-de-caixa`, testes, specs e o legado.
- **Regra aplicada:** hipótese vira teste que falha antes da correção; filtro de isolamento é provado por **mutação**.
- **Resultado:** nenhum achado alto. Injeção, `Prisma.raw`, validação do `?start=`, filtro global de erros e conversão de
  dinheiro conferidos sem problema.

| # | Sev. | Achado | Prova | Destino |
|---|---|---|---|---|
| 1 | Média | O teste da árvore corrompida não provava **cada** filtro sozinho: `b.client_id` (o que barra o vetor real — conta de B em categoria legítima de A) não era isolado; receitas sem teste | Novos casos (despesas e receitas); **mutação**: sem `b.client_id` os dois falham | ✅ Testes adicionados |
| 2 | Média | Sem e2e das rotas HTTP (401, 422 do `?start`, A × B) — repetição do nº 5 da revisão de `contas` | — | ✅ `test/fluxo-tenant.integracao.spec.ts` (8) |
| 3 | Baixa | Saldo anterior: extrato de A apontando para conta bancária de B entrava no saldo de A | Teste falhou (**999,99 vazou**) → passou | ✅ `JOIN bank_accounts … client_id` + `s.client_id` |
| 4 | Baixa | `?start=0050-06` virava 1950 (`Date.UTC` com ano < 100) | 4 anos fora da faixa → 422 | ✅ Ano entre 1900 e 2100 |
| 5 | Baixa | `centavos()` com `Number`: perda de precisão em somas gigantes; `'NaN'` virava `NaN` | — | ✅ Regex + `BigInt` + limite seguro (erro em vez de número errado) |
| 6 | Baixa | 5 consultas em paralelo por requisição podem esgotar o pool | hipótese (precisa de carga) | ⏳ Pendência: teste de carga e `connection_limit` |
| 7 | Baixa | Consulta do saldo sem índice com `created_at` | `EXPLAIN`: `Index Only Scan` no índice novo | ✅ Índice `(client_id, bank_account_id, created_at, id)`; ganho real a medir com volume |
| 8 | Baixa | Divergências fora do ADR-006: raiz por `parent_id` e ordenação vs. collation `_ci` do MySQL | equivalência agora testada em **despesas e receitas** | ✅ Registradas no ADR-006 (notas de implementação) |
| 9 | Baixa | Asserção "outro cliente não soma" fraca | medido antes/depois | ✅ Corrigida |

**Hipótese que não se aplicou:** `?start[x]=1` como objeto — o parser de query do Express 5 é o simples; `start[x]` é outro
parâmetro, ignorado. O teste agora **afirma** esse comportamento.
