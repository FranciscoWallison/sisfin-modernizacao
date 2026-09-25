# Progresso — módulo `contas`

> O `tasks.md` é **imutável depois de aprovado**: qualquer mudança (inclusive marcar `[x]`) muda o hash e derruba a
> aprovação. Por isso o andamento fica aqui. Detalhes de cada task no `docs/diario-de-bordo.md`.
> Plano aprovado: hash `d854ed6545ef` (Francisco, 25/09/2026).

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| T01. Esqueleto da API | ✅ | `curl localhost:3300/health` → `{"status":"ok"}` 200 no container; `test/health.e2e-spec.ts` | Porta do host **3300** (3000 ocupada por outro processo local) — ver "Mudanças após a aprovação" no `design.md` |
| T02. Sensores de arquitetura | ✅ | `test/arquitetura.spec.ts` (3): `src/` limpo; fixture `domain → @prisma/client` falha com `dominio-puro` e `prisma-so-em-infra` **e a mensagem de correção**; lint de SQL cru | Hook pós-edição roda `tsc` + `depcruise` em ~4 s; job `api` no CI. Bug do sensor dormente corrigido (ver diário) |
| T03. Schema Prisma | ✅ | `test/schema.spec.ts` (10 testes): `done` default false nas duas tabelas, DECIMAL(12,2), sem ponto flutuante, `statements.client_id` + auditoria, FK de categoria por tipo | Descoberta: o legado usa `DOUBLE(8,2)`, não `FLOAT` (RN-CON-011 corrigida) |
| T04. ETL MySQL → Postgres | ✅ | `node tools/migrar-dados.mjs --seed` → 9 tabelas com contagens iguais (1.135 linhas), relatório `docs/relatorios/etl-seed.md`; sequences ajustadas (próximo id = max+1); com dados das sondas, detectou o extrato órfão | Responde DUV-CON-005 (0 contas com saldo ≠ extrato). Detector de arredondamento **não exercitado**: os valores do seed são inteiros |
| T05. Formato HTTP compatível | ✅ | `test/formato-http.e2e-spec.ts` (11): 422 `{campo:[msg]}`, campo não declarado → 422, 500 genérico com id e **sem SQL**, P2025 → 404, CORS allowlist, boot recusa segredo < 32 bytes e `DEBUG_SQL` fora de dev, datas Carbon, Decimal → número | Log por requisição **não** registra corpo, cabeçalhos nem query (redação por construção) |
| T06. Auth compatível | ✅ | **`paridade/auth/RN-AUT-001-a-003-sessao.json` com `--alvo novo` contra :3300** (1º caso de paridade no sistema novo); `test/auth-compat.e2e-spec.ts` (13): hash `$2y# Progresso — módulo `contas`

> O `tasks.md` é **imutável depois de aprovado**: qualquer mudança (inclusive marcar `[x]`) muda o hash e derruba a
> aprovação. Por isso o andamento fica aqui. Detalhes de cada task no `docs/diario-de-bordo.md`.
> Plano aprovado: hash `d854ed6545ef` (Francisco, 25/09/2026).

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| T01. Esqueleto da API | ✅ | `curl localhost:3300/health` → `{"status":"ok"}` 200 no container; `test/health.e2e-spec.ts` | Porta do host **3300** (3000 ocupada por outro processo local) — ver "Mudanças após a aprovação" no `design.md` |
| T02. Sensores de arquitetura | ✅ | `test/arquitetura.spec.ts` (3): `src/` limpo; fixture `domain → @prisma/client` falha com `dominio-puro` e `prisma-so-em-infra` **e a mensagem de correção**; lint de SQL cru | Hook pós-edição roda `tsc` + `depcruise` em ~4 s; job `api` no CI. Bug do sensor dormente corrigido (ver diário) |
| T03. Schema Prisma | ✅ | `test/schema.spec.ts` (10 testes): `done` default false nas duas tabelas, DECIMAL(12,2), sem ponto flutuante, `statements.client_id` + auditoria, FK de categoria por tipo | Descoberta: o legado usa `DOUBLE(8,2)`, não `FLOAT` (RN-CON-011 corrigida) |
| T04. ETL MySQL → Postgres | ✅ | `node tools/migrar-dados.mjs --seed` → 9 tabelas com contagens iguais (1.135 linhas), relatório `docs/relatorios/etl-seed.md`; sequences ajustadas (próximo id = max+1); com dados das sondas, detectou o extrato órfão | Responde DUV-CON-005 (0 contas com saldo ≠ extrato). Detector de arredondamento **não exercitado**: os valores do seed são inteiros |
| T05. Formato HTTP compatível | ✅ | `test/formato-http.e2e-spec.ts` (11): 422 `{campo:[msg]}`, campo não declarado → 422, 500 genérico com id e **sem SQL**, P2025 → 404, CORS allowlist, boot recusa segredo < 32 bytes e `DEBUG_SQL` fora de dev, datas Carbon, Decimal → número | Log por requisição **não** registra corpo, cabeçalhos nem query (redação por construção) |
, claims, lockout, sem cliente → 400, logout/blacklist, 7 tokens rejeitados (none, HS512, outro segredo, expirado, sem jti, usuário apagado), 60 req/min + 429 | Rate limit/lockout/blacklist em memória: valem por instância (Redis se escalar). `@nestjs/throttler` trocado por guard próprio (janela fixa igual ao Laravel) |
| T07. Tenant | ✅ | `test/tenant-regras.spec.ts` (27: cada operação do Prisma, sem cliente → erro, `connect` proibido, `clientId` sobrescrito/removido); `test/tenant.integracao.spec.ts` (7, **Postgres real**: A × B em find/count/aggregate/groupBy/update/delete/*Many, "doação" bloqueada, **filtro vale dentro de `$transaction`**); `test/com-cliente.e2e-spec.ts` (cliente vem do banco, não do token; sem cliente → 403) | Regra de camadas nova: `infra-usa-prisma-com-tenant`. Testes de integração pulam sem `DATABASE_URL` (CI ganha banco na T15) |
| T08. Fatias de leitura compatíveis | ✅ | **`node tools/espelho.mjs` → 12/12 rotas com resposta IDÊNTICA ao legado** (valores, não só formato) logo após o ETL, incluindo árvore de categorias, datas Carbon, `statement_data`, paginação e 404 entre clientes; `test/paginacao.spec.ts` | Espelho achou 1 diferença (links de paginação sem `orderBy`/`sortedBy`) — corrigida |
| T09–T18 | ⏳ | | Fase B/C |
