Status: rascunho — aguardando aprovação do Francisco

# Design — módulo `contas` (TO-BE)

> Implementa `requirements.md` (REQ-CON-01..12). Stack e contrato: ADR-001. Correções: ADR-003 (aceito) e ADR-004 (proposto).
> Contrato HTTP a preservar: `.specs/legado/modulos/contas/contrato.md`.

## 1. Visão geral

```text
docker compose
├── legacy-app :8081 ── legacy-db  (MySQL 5.7)   ← oráculo
└── api        :3000 ── api-db     (PostgreSQL 16) ← sistema novo
                 ▲
                 └── tools/migrar-dados.mjs (ETL MySQL → Postgres, mesmos ids)

node tools/paridade.mjs --base http://localhost:3000 --alvo novo   ← critério de aceite
```

Os dois bancos partem **dos mesmos dados** (o ETL copia o banco do oráculo), então os mesmos casos de paridade
rodam nos dois lados.

## 2. Estrutura do código (`api/`)

```text
api/src/
├── main.ts, app.module.ts
├── shared/                         ← infraestrutura transversal (fora do gate de tasks por módulo)
│   ├── prisma/                     PrismaService + extensão de tenant
│   ├── tenant/                     ClienteContext (AsyncLocalStorage) + guard
│   ├── auth-compat/                POST /api/access_token compatível (JWT HS256, bcrypt $2y$)
│   └── http/                       formato de erro Laravel (422 {campo:[msg]}), serializer de datas Carbon
├── compat/                         ← fatias de LEITURA de outros módulos, só o que contas e paridade usam
│   ├── contas-bancarias.controller.ts   GET /api/bank_accounts, /:id, /lists
│   ├── categorias.controller.ts         GET /api/category_expenses, /api/category_revenues
│   └── extrato.controller.ts            GET /api/statements
└── modules/contas/                 ← gate: exige .specs/novo/contas/tasks.md aprovado
    ├── domain/                     funções puras, sem Nest/Prisma
    │   ├── vencimentos.ts          REQ-CON-03
    │   ├── movimentos.ts           REQ-CON-04, 05, 08, 09
    │   └── busca.ts                REQ-CON-11 (parse de período e valor BR)
    ├── application/contas.service.ts   orquestra transação, repositório e domínio
    ├── infra/contas.repository.ts      Prisma
    └── http/                       controllers /api/bill_pays e /api/bill_receives, DTOs (class-validator)
```

**Regras de camadas** (sensor: `dependency-cruiser`, roda no hook pós-edição e no CI):
- `modules/*/domain/**` não importa `@nestjs/*`, `@prisma/*`, `infra/`, `http/`.
- `modules/*/http/**` só fala com `application/`.
- Só `shared/prisma/**` e `modules/*/infra/**` importam `@prisma/client`.
Mensagens de violação escritas para o agente (dizem o que fazer, não só o que está errado).

## 3. Modelo de dados (Prisma → PostgreSQL)

Nomes de tabela e coluna **iguais ao legado** (`@@map`/`@map`) para o ETL ser uma cópia direta.

| Tabela | Mudanças em relação ao legado |
|---|---|
| `bill_pays`, `bill_receives` | `value DECIMAL(12,2)` (era FLOAT — RN-CON-011); `done BOOLEAN NOT NULL DEFAULT false` nas duas (RN-CON-012); `category_id`, `bank_account_id` `NOT NULL` com FK |
| `bank_accounts` | `balance DECIMAL(12,2)` |
| `statements` | `value`, `balance` `DECIMAL(12,2)`; `statementable_type` guarda `BillPay`/`BillReceive` (sem namespace PHP); nova coluna `kind` (`movimento` \| `estorno`) para o estorno da exclusão (REQ-CON-09) |
| `clients`, `users`, `category_*`, `banks` | cópia (necessárias para login, tenant e FKs) |

Dinheiro no código: `Prisma.Decimal` no domínio e no banco; conversão para `number` **só** na serialização HTTP.

## 4. Tenant (REQ-CON-07)

- `TenantGuard` lê o `client_id` do usuário do JWT e grava em `ClienteContext` (AsyncLocalStorage).
- **Um único ponto de filtro:** extensão do Prisma que, para os modelos com `client_id`, injeta `where: { client_id }`
  em leituras/updates/deletes e `data.client_id` em creates. Sem contexto de cliente → **erro** (nunca "sem filtro":
  corrige por construção a DUV-CON-006).
- Registro de outro cliente → `findFirst` não acha → **404**.
- **Sensor estrutural:** teste que falha se algum arquivo fora de `shared/prisma/` e `modules/*/infra/` usar o Prisma, e
  teste e2e que cria dado no cliente A e tenta ler/alterar/excluir como cliente B (espelha `RN-CON-008`).
- Validação de `category_id`/`bank_account_id` usa o mesmo cliente do contexto → 422 se for de outro (RN-CON-014).

## 5. Saldo, extrato e transação (REQ-CON-04, 05, 06, 08, 09)

O domínio calcula **movimentos**; a aplicação os grava numa única transação.

```ts
// domain/movimentos.ts — puro
type Estado = { valor: Decimal; paga: boolean; contaBancaria: number } | null; // null = não existe
type Tipo = 'pagar' | 'receber';
function movimentos(tipo: Tipo, antes: Estado, depois: Estado): { contaBancaria: number; delta: Decimal; kind: 'movimento' | 'estorno' }[]
```

| antes → depois | Movimentos (conta a pagar; a receber inverte o sinal) |
|---|---|
| null → aberta | nenhum |
| null → paga | `−valor` na conta (REQ-CON-05) |
| aberta → paga | `−valor` (REQ-CON-04) |
| paga → paga, valor mudou | `antigo − novo` (REQ-CON-04) |
| paga → aberta | `+antigo` (REQ-CON-04) |
| paga (conta A) → paga (conta B) | `+antigo` em A, `−novo` em B (REQ-CON-08) |
| paga → null (exclusão) | `+antigo`, `kind: estorno` (REQ-CON-09) |

`application/contas.service.ts` — dentro de `prisma.$transaction`:
1. `SELECT … FOR UPDATE` nas contas bancárias envolvidas (ordem crescente de id, evita deadlock);
2. grava/atualiza/exclui a conta;
3. aplica cada delta ao `balance` e insere o `statement` com o saldo resultante.
Falha em qualquer passo → rollback de tudo (REQ-CON-06; teste de integração com falha injetada).

**Repetição (REQ-CON-03/05):** `vencimentos(dataOriginal, n, tipo)` devolve as N datas (a partir da data original, com
ajuste para o último dia do mês). A conta informada é criada com o `done` enviado; **as N cópias sempre `done=false`**.

## 6. Validação (REQ-CON-01, 02, 10)

DTO com `class-validator`: `name` (1–255), `date_due` (data ISO), `value` (> 0, até 2 casas), `done` (boolean, default
false), `category_id` e `bank_account_id` **obrigatórios** e do cliente, `repeat_number` (int ≥ 0) e `repeat_type`
(1|2) obrigatórios se `repeat=true`. Erros no formato Laravel: **422** `{"campo": ["mensagem"]}`.

## 7. Listagem, busca e totais (REQ-CON-11, 12 — dependem do ADR-004)

- `search` vazio/ausente → sem filtro. Com valor: `name ILIKE %s%` OU período BR OU valor BR (`domain/busca.ts`).
- Paginação 15 por página; `orderBy` restrito a colunas conhecidas (evita injeção por nome de coluna).
- `bill_data` calculado com **o mesmo `where`** da lista, agregando por `done` com parênteses corretos.
- `total_today` / `total_rest_of_month`: mesma regra de datas do legado, em `America/Sao_Paulo`.

## 8. Autenticação compatível (`shared/auth-compat`)

Só o necessário para o SPA e os casos de paridade: `POST /api/access_token` → `{token}` (HS256, 60 min), 400/422 como no
legado; `bcrypt.compare` aceita `$2y$` trocando o prefixo por `$2b$` (mesmo algoritmo). O segredo JWT vem de env e
**a API não sobe sem ele** (lição dos repositórios `back-app-parceiro`/`agendaai-backend`). Refresh, logout e revogação
ficam para o módulo `auth`.

## 9. Migração de dados (`tools/migrar-dados.mjs`)

1. Lê o MySQL do oráculo e grava no Postgres, tabela a tabela, **preservando ids**; ajusta as sequences.
2. `FLOAT → DECIMAL`: arredonda para 2 casas; reporta linhas em que o arredondamento mudou o valor.
3. **Saldos migram como estão** (decisão recomendada no ADR-003): os bugs RN-CON-009/010 já distorceram saldos
   no legado e não há como separar "o que o usuário quis". O ETL gera um **relatório de divergência**
   `saldo × soma do extrato` por conta bancária (responde a DUV-CON-005) em `docs/relatorios/`.
4. `statementable_type`: `SisFin\Models\BillPay` → `BillPay`; extratos órfãos (conta excluída) são mantidos e listados no relatório.

## 10. Observabilidade e harness

- Log estruturado por requisição (método, rota, status, `client_id`, duração) — equivalente ao `oraculo-sql` no lado novo:
  `DEBUG_SQL=1` liga o log de queries do Prisma.
- Hook pós-edição passa a rodar `tsc --noEmit` e `dependency-cruiser` em `api/`.
- CI ganha o job `api`: sobe `api-db` + `api`, roda ETL, testes unitários/integração e `paridade --alvo novo`.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Diferenças de arredondamento FLOAT → DECIMAL mudarem deltas | Casos usam valores inteiros; relatório do ETL |
| Formato de datas Carbon quebrar o SPA | Serializer compartilhado em `shared/http` + caso de contrato |
| ICU/ambiente: legado e novo divergirem por ambiente, não por regra | ADR-004; tratar como dúvida |
| Deadlock ao mover conta entre duas contas bancárias | Lock em ordem crescente de id |
