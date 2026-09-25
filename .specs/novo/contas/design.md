Status: aprovado — Francisco, 25/09/2026 (com o plano, hash d854ed6545ef). Mudanças posteriores ficam registradas no fim do arquivo.

# Design — módulo `contas` (TO-BE)

> Implementa `requirements.md` (REQ-CON-01..13). Stack e contrato: ADR-001. Correções: ADR-003, ADR-004 e ADR-005 (aceitos).
> Contrato HTTP a preservar: `.specs/legado/modulos/contas/contrato.md`.

## 1. Visão geral

```text
docker compose
├── legacy-app :8081 ── legacy-db  (MySQL 5.7)   ← oráculo
└── api        :3300 ── api-db     (PostgreSQL 16) ← sistema novo (porta 3000 dentro do container)
                 ▲
                 └── tools/migrar-dados.mjs (ETL MySQL → Postgres, mesmos ids)

node tools/paridade.mjs --base http://localhost:3300 --alvo novo   ← critério de aceite
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
│   ├── extrato.controller.ts            GET /api/statements
│   └── infra/                           repositórios de leitura — sob as MESMAS regras de camada e de tenant (revisão #11)
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
- Só `shared/prisma/**`, `modules/*/infra/**` e `compat/infra/**` importam `@prisma/client`.
- `$queryRaw`/`$executeRaw` só em `*/infra/**`, em funções cuja assinatura exige `clientId` (checagem por lint — revisão #2).
Mensagens de violação escritas para o agente (dizem o que fazer, não só o que está errado).

## 3. Modelo de dados (Prisma → PostgreSQL)

Nomes de tabela e coluna **iguais ao legado** (`@@map`/`@map`) para o ETL ser uma cópia direta.

| Tabela | Mudanças em relação ao legado |
|---|---|
| `bill_pays`, `bill_receives` | `value DECIMAL(12,2)` (era FLOAT — RN-CON-011); `done BOOLEAN NOT NULL DEFAULT false` nas duas (RN-CON-012); `category_id`, `bank_account_id` `NOT NULL` com FK |
| `bank_accounts` | `balance DECIMAL(12,2)` |
| `statements` | `client_id NOT NULL` (como no legado); `value`, `balance` `DECIMAL(12,2)`; `statementable_type` guarda `BillPay`/`BillReceive` (sem namespace PHP); novas colunas `kind` (`movimento` \| `estorno`, REQ-CON-09) e `user_id` + `action` (`criacao` \| `pagamento` \| `alteracao` \| `estorno` \| `exclusao`) para auditoria (revisão #12) |
| `clients`, `users`, `category_*`, `banks` | cópia (necessárias para login, tenant e FKs) |

Dinheiro no código: `Prisma.Decimal` no domínio e no banco; conversão para `number` **só** na serialização HTTP.

## 4. Tenant (REQ-CON-07)

- **Origem do cliente:** o token do legado não tem `client_id` (só `sub` e `user{id,name,email}` — RN-AUT-003). O
  `TenantGuard` resolve `client_id` **pelo `sub` no banco a cada requisição** (usuário apagado → 401; sem cliente →
  **403** determinístico) e grava em `ClienteContext` (AsyncLocalStorage). O login também recusa usuário sem cliente.
  Nunca confiar num `client_id` vindo do token ou do corpo (revisão #5).
- **Modelos com tenant (lista fechada):** `bill_pays`, `bill_receives`, `bank_accounts`, `statements`,
  `category_expenses`, `category_revenues`.
- **Um único ponto de filtro:** extensão do Prisma que, nesses modelos, trata **cada operação**: `findUnique*` →
  reescrito para `findFirst*` com `client_id`; `findFirst/findMany/count/aggregate/groupBy/update*/delete*` →
  `where.client_id`; `create/createMany/upsert` → `data.client_id` **sempre sobrescrito**; em `update*`, `client_id`
  do `data` é **removido**; escrita aninhada com `connect` é proibida (lança erro). Sem contexto → **erro**, nunca
  "sem filtro" (corrige por construção a DUV-CON-006). SQL cru não passa pela extensão: só em `*/infra/**`, com
  `clientId` obrigatório na assinatura e usado no `WHERE` (revisão #2).
- Registro de outro cliente → não encontrado → **404**.
- **Sensores:** (a) estrutural: Prisma só em `shared/prisma`, `modules/*/infra`, `compat/infra`; (b) teste da extensão
  para cada operação da lista acima; (c) e2e cliente A × B cobrindo contas (ler/alterar/excluir), **totais**
  (`bill_data`, `total_today`, `total_rest_of_month`), extrato (`statement_data`), `/bank_accounts/lists`, categorias e
  o caminho com lock (espelha `RN-CON-008`).
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

`application/contas.service.ts` — dentro de `prisma.$transaction` (revisão #1):
1. **Trava e relê a conta:** `SELECT … FROM bill_* WHERE id = $1 AND client_id = $2 FOR UPDATE` → estado `antes`
   (valor, paga, conta bancária) lido **sob lock**. Duas requisições simultâneas na mesma conta ficam em fila.
2. Valida o `depois` (categoria do tipo certo e conta bancária nova do cliente — §6) **antes** de qualquer movimento.
3. Calcula `movimentos(tipo, antes, depois)`.
4. `SELECT … FOR UPDATE` nas contas bancárias envolvidas — antiga **e** nova — em ordem crescente de id (evita deadlock).
5. Grava/atualiza/exclui a conta.
6. Aplica cada delta ao `balance` e insere o `statement` com o saldo resultante, `user_id` e `action`.
Falha em qualquer passo → rollback de tudo (REQ-CON-06; teste de integração com falha injetada).
**Teste de concorrência:** dois `PUT done=true` paralelos na mesma conta → exatamente um débito.

**Repetição (REQ-CON-03/05):** `vencimentos(dataOriginal, n, tipo)` devolve as N datas (a partir da data original, com
ajuste para o último dia do mês). A conta informada é criada com o `done` enviado; **as N cópias sempre `done=false`**.

## 6. Validação (REQ-CON-01, 02, 10)

DTO com `class-validator`, `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — `id`, `client_id`,
`created_at` etc. no corpo → 422 (revisão #7):
- `name` (1–255), `date_due` (data ISO), `done` (boolean, default false);
- `value`: > 0 e ≤ 999.999.999,99, no máximo 2 casas; convertido para `Decimal` **a partir do texto** do JSON
  (rejeita exponencial, `NaN`, `Infinity`); saldo que estouraria `DECIMAL(12,2)` → 422 (revisão #8);
- `category_id` obrigatório e **do tipo certo**: conta a pagar → `category_expenses`, a receber → `category_revenues`
  (como `BillPayRequest`/`BillReceiveRequest` do legado), sempre do cliente do contexto; FK para a tabela certa;
- `bank_account_id` obrigatório e do cliente — no `PUT`, o novo valor é validado **antes** do estorno/débito (revisão #6);
- `repeat_number` inteiro 0–120 e `repeat_type` (1|2) obrigatórios se `repeat=true` (teto contra DoS — revisão #7).
Erros no formato Laravel: **422** `{"campo": ["mensagem"]}`.

## 7. Listagem, busca e totais (REQ-CON-11, 12 — dependem do ADR-004)

- `search` vazio/ausente → sem filtro. Com valor (≤ 100 caracteres): `name ILIKE %s%` com `%`, `_` e `\` escapados,
  OU período BR OU valor BR (`domain/busca.ts`).
- Paginação 15 por página; `page` inteiro 1–10.000; `orderBy` ∈ {`id`, `name`, `date_due`, `value`, `done`} e
  `sortedBy` ∈ {`asc`, `desc`} — fora disso, 422. Parâmetros do Prettus que o legado aceitava (`filter`, `with`,
  `searchFields`, `searchJoin`) são **ignorados** explicitamente, com caso de teste (revisão #10).
- `bill_data` calculado com **o mesmo `where`** da lista, agregando por `done` com parênteses corretos.
- `total_today` / `total_rest_of_month`: mesma regra de datas do legado, em `America/Sao_Paulo`.

## 8. Autenticação compatível (`shared/auth-compat`)

Só o necessário para o SPA e os casos de paridade: `POST /api/access_token` → `{token}` (HS256, 60 min), 400/422 como no
legado; `bcrypt.compare` aceita `$2y$` trocando o prefixo por `$2b$` (mesmo algoritmo).

Controles que **não podem se perder** (revisão #3, #4; RN-AUT-001..003):
- **Segredo:** vem de env, ≥ 32 bytes, validado no boot — **a API não sobe sem ele** (lição de `back-app-parceiro`/`agendaai-backend`).
  Segredo **diferente** do legado: tokens do oráculo e do novo não são intercambiáveis.
- **Verificação:** `algorithms: ['HS256']` fixo (rejeita `none`/RS*), exige `exp`, `nbf`, `iat`, `sub`, `jti`;
  `clockTolerance` ≤ 5 s; usuário do `sub` precisa existir (lookup do §4).
- **Lockout:** 5 tentativas erradas por e-mail+IP → **403** `"Too many login attempts. Please try again in 60 seconds."` (RN-AUT-001).
- **Rate limit:** 60 req/min por usuário (ou IP, sem autenticação), com `X-RateLimit-*` (`@nestjs/throttler`, RN-AUT-002).
- **Logout e revogação:** `POST /api/logout` com blacklist de `jti` até o `exp` (RN-AUT-003). Entra **junto** com o
  `contas`, não depois — ver ADR-005.
- **Claims:** mantém `user{id,name,email}` por compatibilidade com o SPA (nome e e-mail em claro no payload — risco
  registrado no ADR-005; remover quando o front novo não depender disso).
- `refresh_token` fica para o módulo `auth`.

## 9. Migração de dados (`tools/migrar-dados.mjs`)

1. Lê o MySQL do oráculo e grava no Postgres, tabela a tabela, **preservando ids**; ajusta as sequences.
2. `FLOAT → DECIMAL`: arredonda para 2 casas; reporta linhas em que o arredondamento mudou o valor.
3. **Saldos migram como estão** (decisão recomendada no ADR-003): os bugs RN-CON-009/010 já distorceram saldos
   no legado e não há como separar "o que o usuário quis". O ETL gera um **relatório de divergência**
   `saldo × soma do extrato` por conta bancária (responde a DUV-CON-005).
4. `statementable_type`: `SisFin\Models\BillPay` → `BillPay`; extratos órfãos (conta excluída) são mantidos e listados no relatório.
5. **Dados pessoais (revisão #12):** o relatório só traz ids e valores — nunca nome, e-mail ou hash. Relatórios de
   execuções com dados reais ficam em `.relatorios/` (no `.gitignore`); só o relatório do **seed** (dados fictícios)
   é versionado em `docs/relatorios/`.

## 10. Observabilidade e harness

- Log estruturado por requisição (método, rota, status, `client_id`, `user_id`, duração), com **redação** de
  `password`, `token` e `Authorization`; o corpo de `/api/access_token` nunca é logado (revisão #9).
- `DEBUG_SQL=1` liga o log de queries do Prisma (equivalente ao `oraculo-sql` no lado novo) — **só** com
  `NODE_ENV=development`; em outro ambiente a API recusa subir com ele (revisão #9).
- **Filtro global de exceções** com mapeamento fechado: Prisma `P2025` → 404, `P2002`/`P2003` → 422, qualquer outra →
  500 com mensagem genérica e id de correlação (detalhe só no log). Nunca vaza tabela, coluna ou SQL (revisão #9).
- CORS com allowlist de origens por env (o legado usava `*` — revisão #12).
- Hook pós-edição passa a rodar `tsc --noEmit` e `dependency-cruiser` em `api/`.
- CI ganha o job `api`: sobe `api-db` + `api`, roda ETL, testes unitários/integração e `paridade --alvo novo`.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Diferenças de arredondamento FLOAT → DECIMAL mudarem deltas | Casos usam valores inteiros; relatório do ETL |
| Formato de datas Carbon quebrar o SPA | Serializer compartilhado em `shared/http` + caso de contrato |
| ICU/ambiente: legado e novo divergirem por ambiente, não por regra | ADR-004; tratar como dúvida |
| Deadlock ao mover conta entre duas contas bancárias | Lock em ordem crescente de id |
| Corrida em pagamentos simultâneos | Lock e releitura da conta dentro da transação + teste de concorrência (§5) |
| Bypass do filtro de tenant por SQL cru ou operação não coberta | Lista fechada de operações + lint de raw + e2e A × B (§4) |

> Revisão de segurança das specs: `docs/revisoes/2026-09-25-security-contas.md` (12 achados, todos incorporados).

## Mudanças após a aprovação

| Data | Mudança | Motivo |
|---|---|---|
| 25/09/2026 | API exposta no host em **:3300** (continua :3000 dentro do container) | A porta 3000 do host já estava em uso por outro processo local (T01) |
| 25/09/2026 | NestJS **11.2.6** e Prisma **6.19.3** (não 12 / 7-8) | Nest 12 é recente e muda a base de módulos; o `latest` do Prisma é um RC da v8 — preferidas as últimas estáveis conhecidas |
