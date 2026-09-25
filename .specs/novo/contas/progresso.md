# Progresso — módulo `contas`

> O `tasks.md` é **imutável depois de aprovado**: qualquer mudança (inclusive marcar `[x]`) muda o hash e derruba a
> aprovação. Por isso o andamento fica aqui. Detalhes de cada task no `docs/diario-de-bordo.md`.
> Plano aprovado: hash `d854ed6545ef` (Francisco, 25/09/2026).

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| T01. Esqueleto da API | ✅ | `curl localhost:3300/health` → `{"status":"ok"}` 200 no container; `test/health.e2e-spec.ts` | Porta do host **3300** (3000 ocupada por outro processo local) — ver "Mudanças após a aprovação" no `design.md` |
| T02. Sensores de arquitetura | ⏳ | | |
| T03. Schema Prisma | ✅ | `test/schema.spec.ts` (10 testes): `done` default false nas duas tabelas, DECIMAL(12,2), sem ponto flutuante, `statements.client_id` + auditoria, FK de categoria por tipo | Descoberta: o legado usa `DOUBLE(8,2)`, não `FLOAT` (RN-CON-011 corrigida) |
| T04. ETL MySQL → Postgres | ⏳ | | |
| T05. Formato HTTP compatível | ⏳ | | |
| T06. Auth compatível | ⏳ | | |
| T07. Tenant | ⏳ | | |
| T08. Fatias de leitura compatíveis | ⏳ | | |
| T09–T18 | ⏳ | | Fase B/C |
