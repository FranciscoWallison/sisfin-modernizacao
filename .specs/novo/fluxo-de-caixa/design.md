Status: rascunho — aguardando aprovação do Francisco

# Design — módulo `fluxo-de-caixa` (TO-BE)

> Implementa `requirements.md` (REQ-FLX-01..07). Reaproveita a fundação do módulo `contas` (auth-compat, tenant,
> formato HTTP, sensores). Contrato: `.specs/legado/modulos/fluxo-de-caixa/contrato.md`. Correções: ADR-006.

## 1. Estrutura (`api/src/modules/fluxo-de-caixa/`)

```text
domain/
  janela.ts        início/fim/"primeiro mês"/corte do saldo a partir de hoje ou de ?start=  (puro, REQ-FLX-02/04/06)
  montagem.ts      formatPeriods + formatCategories do legado, em função pura (esparso, ordenado)  (REQ-FLX-03/05)
infra/
  fluxo.repositorio.ts   SQL agregado (nested set) com clientId obrigatório — via PRISMA_TENANT.$queryRaw
application/
  fluxo.service.ts       junta janela + consultas + montagem
http/
  fluxo.controller.ts    GET /api/cash_flows?start=, GET /api/cash_flows/monthly — @ComCliente()
```

As regras de camadas da T02 valem sem mudança (domain puro; SQL cru só em `infra/` com `clientId: number`).

## 2. Janela (domain/janela.ts)

```ts
janelaMensal(hoje: Date, start?: 'aaaa-mm') → {
  inicio: '2026-09-01', fim: '2027-07-31',          // mês atual (ou start) até +10 meses, fim do mês
  primeiroMes: { inicio: '2026-08-01', fim: '2026-08-31' },   // mês anterior INTEIRO (REQ-FLX-04)
  corteSaldo: '2026-08-01'                            // extratos lançados ANTES disto (REQ-FLX-06)
}
janelaDiaria(hoje) → { inicio: hoje, fim: hoje + 30 dias }   // REQ-FLX-01
```

Tudo em UTC, como o legado. `start` fora do formato `aaaa-mm` ou mês inexistente → 422.

## 3. Consultas (infra) — uma agregação por tipo (receitas/despesas)

```sql
SELECT r.id, r.name, to_char(b.date_due, :formato) AS period, SUM(b.value)::text AS total
FROM   category_expenses r
JOIN   category_expenses c ON c._lft BETWEEN r._lft AND r._rgt AND c.client_id = r.client_id   -- filhas: mesmo cliente
JOIN   bill_pays b         ON b.category_id = c.id AND b.client_id = r.client_id               -- contas: mesmo cliente
WHERE  r.client_id = $clientId AND r.parent_id IS NULL                                          -- raiz
  AND  b.date_due BETWEEN $inicio AND $fim
  [AND b.done = true]                                                                           -- só no "primeiro mês"
GROUP  BY r.id, r.name, period
ORDER  BY period, r.name;
```

- `client_id` nas **três** tabelas (REQ-FLX-07 / DUV-FLX-004). Raiz = `parent_id IS NULL` (equivale à profundidade 0 do
  legado numa árvore íntegra; o ETL já verifica referências entre clientes).
- Tabelas e formato vêm de constantes (`Prisma.raw`), nunca da entrada.
- Saldo anterior:
  `SELECT SUM(s.balance) FROM statements s JOIN (SELECT bank_account_id, MAX(id) id FROM statements WHERE client_id = $c AND created_at < $corte GROUP BY bank_account_id) u ON u.id = s.id`.
- Dinheiro: `SUM(...)::text` → número só na serialização (como em `contas`).

## 4. Montagem (domain/montagem.ts)

Porte fiel de `formatPeriods`/`formatCategories`: une períodos de receitas e despesas (sem repetição, ordenados), zera
o lado que não tem valor, agrupa categorias por `id` com `periods: [{ total, period }]` (essa ordem de chaves).
O "primeiro mês" entra antes dos demais, como o legado faz (`prepend`).

## 5. HTTP

- `GET /api/cash_flows` — `?start=aaaa-mm` opcional (allowlist por regex; inválido → 422). Resposta no formato do
  contrato.
- `GET /api/cash_flows/monthly` — sem parâmetros.
- Ambas `@ComCliente()`; rate limit e formato de erro herdados da fundação.

## 6. Testes

| Nível | O quê |
|---|---|
| Unitário | `janela.ts` (mês atual, `start`, virada de ano, fim de mês, 422), `montagem.ts` (esparso, ordem, zeros, primeiro mês na frente) |
| Integração (Postgres) | árvore íntegra = resultado do legado; **árvore corrompida de propósito** (filha de outro cliente sob a raiz) não vaza; corte do saldo com extrato lançado no último dia do mês |
| Paridade | `fluxo-de-caixa/*.json` com `--alvo novo` |
| Espelho | `/api/cash_flows/monthly` idêntico ao legado após o ETL |
| Tela | `#!/cash-flow` e gráfico do dashboard em :8083 (Playwright) |

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Árvore de categorias inconsistente (legado desliga o tenant ao criar categoria) | `client_id` nas três tabelas + checagem do ETL + teste com árvore corrompida |
| `parent_id IS NULL` ≠ profundidade 0 numa árvore inconsistente | Teste de integração compara as duas definições no banco migrado |
| Diferença de ordenação por nome (collation MySQL × Postgres) | Espelho do `monthly`; ordenação de `categories_period` testada com nomes acentuados |
