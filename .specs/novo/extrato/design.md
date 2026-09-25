Status: rascunho — aguardando aprovação do Francisco

# Design — módulo `extrato` — TO-BE

> Implementa `requirements.md` (REQ-EXT-01..06). Tira o extrato do `compat/` para um módulo próprio, com a mesma
> serialização. Contrato: `.specs/legado/modulos/extrato/contrato.md`. Correções: ADR-008 (proposto).

## 1. Estrutura (`api/src/modules/extrato/`)

```text
domain/
  consulta.ts       interpreta orderBy/sortedBy (allowlist → campo) e o período do search  (puro)
infra/
  extrato.repositorio.ts   lista + totais via PRISMA_TENANT, com o MESMO where (período) nos dois
application/
  extrato.service.ts
http/
  extrato.controller.ts    GET /api/statements — @ComCliente()
```

- **Período:** reaproveita o `interpretarBusca` do módulo `contas` (mesmo formato de tela, ADR-004). Ele sai de
  `modules/contas/domain/busca.ts` para `shared/dominio/busca.ts`, para dois módulos não se importarem entre si.
  A suíte de `contas` tem de continuar verde.
- **Allowlist de ordenação:**

  | `orderBy` | Ordena por |
  |---|---|
  | `id` | `id` |
  | `value` | `value` |
  | `balance` | `balance` |
  | `bank_account_id` | `bankAccountId` |
  | `date` | `createdAt` |
  | `bank_accounts:bank_account_id\|bank_accounts.name` | `bankAccount.name` (relação do Prisma, sem SQL cru) |

  Sempre com `id` como desempate. Fora da lista → 422.

## 2. Consultas (infra)

- **Lista:** `statement.findMany({ where, include: { bankAccount }, orderBy: [campo, { id }], skip, take: 15 })`.
- **Contagem:** `statement.count({ where })`.
- **Totais:** `statement.groupBy({ by: ['statementableType'], where, _count, _sum: { value } })`, o **mesmo `where`** da lista
  (período). A ordenação não entra nos totais, que é justamente o que quebrava o legado.
- **Período:** `createdAt >= início 00:00 UTC` e `< dia seguinte ao fim 00:00 UTC`. O `where` recebe o cliente da extensão
  de tenant.
- **`include=bankAccount`:** hoje segue a FK do lançamento (RN-EXT-006). Como defesa em profundidade, o lançamento só é
  listado se a conta bancária também for do cliente (`bankAccount: { clientId }` no `where`). Com dados íntegros o
  resultado é o mesmo; o ETL já barra referências cruzadas.

## 3. HTTP

- `GET /api/statements`: `page` (já validado por `paginaDaQuery`), `orderBy`/`sortedBy`, `search`, `include`.
- `limit` **ignorado** (REQ-EXT-04).
- Resposta idêntica à atual do compat (mesma função `contaBancaria` de `shared/http/serializacao`).
- A rota sai de `compat/leitura.controller.ts`.

## 4. Testes

| Nível | O quê |
|---|---|
| Unitário | `consulta.ts`: allowlist (inclusive a chave de join da tela), `sortedBy` inválido → 422, período (formato da tela, dia inválido, fim antes do início) |
| Integração (Postgres) | Período filtra lista e totais (lançamento criado hoje entra no mês e sai de 2000); ordenação por data e por nome da conta com desempate; órfão (conta paga excluída) continua; lançamento de A com conta bancária de B não aparece (defesa em profundidade) |
| Paridade | `extrato/*.json` com `--alvo novo` (2 casos) |
| Espelho | As 3 URLs sem período, sem diferença. A URL da tela com período fixo (`01/09/2026 - 30/09/2026`) sai do espelho: diverge por decisão e dependia da data |
| Tela | `#!/statement` em :8083: abre no mês corrente, ordena por Data e por Conta (Playwright + screenshot) |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Usuário estranhar ver só o mês (antes via tudo) | É o que a tela sempre prometeu (o campo mostra o período). Registrado no ADR-008 como efeito visível |
| Mover o `interpretarBusca` quebrar `contas` | Suíte de `contas` + paridade de `contas/` no alvo novo |
| Ordenar por relação (nome da conta) ficar lento | Extrato é por cliente e paginado; índice de `statements` já existente (cliente, conta, data) |
