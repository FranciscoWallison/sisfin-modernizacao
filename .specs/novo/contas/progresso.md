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
| T08. Fatias de leitura compatíveis | ✅ | **`node tools/espelho.mjs` → 12/12 rotas com resposta IDÊNTICA ao legado** (valores, não só formato) logo após o ETL, incluindo árvore de categorias, datas Carbon, `statement_data`, paginação e 404 entre clientes; `test/paginacao.spec.ts` | Espelho achou 1 diferença (links de paginação sem `orderBy`/`sortedBy`) — corrigida. **Revisão pós-tela real:** o SPA usa `limit`, `orderBy`, `search` e `include=bank`/`bankAccount` que o contrato escrito não tinha → fatias ampliadas; espelho refeito com o **tráfego real** (`.specs/legado/trafego-spa.md`): **15/15 idênticas** |
| T09. Domínio: vencimentos | ✅ | `test/contas-dominio.spec.ts`: 31/01 → 28/02, 31/03, 30/04; bissexto; virada de ano; anual; N=0 | |
| T10. Domínio: movimentos | ✅ | a tabela do design §5 inteira como testes (pagar e receber); dinheiro em **centavos inteiros** (`0,1 + 0,2 = 0,30`) | |
| T11. Domínio: busca BR | ✅ | vazio → sem filtro; período com e sem espaços; data inválida; valor BR só se a busca inteira for número | Desbloqueada: ADR-004 aceito |
| T12. Repositório + serviço transacional | ✅ | `test/contas.integracao.spec.ts` (Postgres real): **falha injetada → nada gravado**; **3 pagamentos simultâneos → 1 débito**; extrato com `user_id`/`action`; exclusão estorna e preserva histórico. **Teste de mutação:** sem o `FOR UPDATE` o teste de concorrência falha 3/3 (débito em dobro) | |
| T13. HTTP: criar/ler/editar/excluir | ✅ | **`paridade --alvo novo`: 9/9** (8 casos de contas + auth) | Divergência nova registrada (ADR-003): PUT de outro cliente com corpo incompleto → 422 antes do 404; caso reforçado com PUT de corpo válido → 404 nos dois sistemas |
| T14. HTTP: listagem, busca e totais | ✅ | `RN-CON-016-a-018` com `--alvo novo`; na tela nova a lista de contas a pagar aparece (no legado vem vazia) e o dashboard mostra os totais do dia iguais ao legado | "Hoje" em **UTC**, como o legado (o design dizia America/Sao_Paulo sem ADR) |
| T15. Gate completo no CI | ✅* | Job `sistema`: sobe legado + novo, ETL, espelho, paridade nos dois alvos, rastreabilidade `--strict`, jest com banco. **Ensaio local na mesma sequência: tudo verde (134 testes)** | *Execução real no GitHub só no próximo push |
| T16. Revisão de segurança do código | ✅ | `docs/revisoes/2026-09-25-security-contas-codigo.md`: os 12 achados das specs confirmados no código; 11 achados novos (0 altos) — **cada hipótese provada por teste antes de corrigir** (deadlock `40P01`, `/API/` sem rate limit, 10 logins paralelos sem bloqueio). 8 corrigidos, 3 pendências registradas; e2e A × B pelas rotas HTTP (7 testes) | Pendências: FK composta/RLS, store compartilhado (Redis), `trust proxy` |
| T17. Testes de segurança transversais | ✅ | `test/contas-seguranca.spec.ts` (17): mass assignment (id, client_id, created_at…) → 422; valor 0/negativo/3 casas/teto/exponencial/NaN → 422; `repeat_number` 121 → 422; ids em texto aceitos; **log sem Authorization, query nem corpo** | Auditoria coberta na T12 |
| T18. Documentação | ✅ | README, diário (etapas 13–15), harness, design (mudanças após a aprovação), inventário, revisões de segurança | |

## Resultado do módulo

- **Paridade no sistema novo: 9/9** (`node tools/paridade.mjs --base http://localhost:3300 --alvo novo`).
- **Espelho de leitura: 15/15** respostas idênticas ao legado logo após o ETL.
- **157 testes** na API (unitários, e2e e integração no Postgres) + 5 do harness; rastreabilidade estrita sem órfãos.
- Mesma tela do legado funcionando contra a API nova (:8083) nas telas de dashboard, contas a pagar/receber, contas
  bancárias, plano de contas e extrato.

## Pendências registradas (não bloqueiam o módulo; bloqueiam produção com escala)

| Pendência | Origem | Quando |
|---|---|---|
| FK composta `(client_id, id)` ou RLS nas referências entre tabelas com tenant | Revisão de segurança do código #4 | Antes do cutover |
| Lockout, blacklist e rate limit em store compartilhado (Redis) | ADR-005 / revisão #6 | Antes de ter mais de uma instância |
| `trust proxy` com a lista exata de proxies | Revisão #3 | Quando houver balanceador na frente |
| Primeira execução real do CI no GitHub | T15 | No próximo push |
| Módulos ainda no legado: fluxo de caixa, bancos, assinaturas, auth completo (refresh) | inventário | Próximos ciclos |
