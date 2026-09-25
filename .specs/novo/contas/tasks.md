Status: rascunho

# Tasks — módulo `contas`

> Plano executável de `design.md`. Cada task é pequena, termina com teste passando e diz qual REQ e qual caso de
> paridade a aceita. Ordem = dependência. Aprovação: `node tools/aprovar-tasks.mjs contas "<nome>"` (ato humano;
> qualquer mudança neste arquivo depois derruba a aprovação). Cada task concluída ganha entrada em `docs/diario-de-bordo.md`.

## Fase A — Fundação (fora do gate do módulo: `api/src/shared`, `api/src/compat`, infra)

- [ ] **T01. Esqueleto da API** — NestJS 11 + TypeScript strict em `api/`; serviços `api` (:3000) e `api-db` (Postgres 16) no `docker-compose.yml`; `/health`. Aceite: `curl :3000/health` → 200.
- [ ] **T02. Sensores de arquitetura** — `dependency-cruiser` com as regras do design §2 (mensagens para o agente); hook pós-edição roda `tsc --noEmit` e o cruiser em `api/`; job `api` no CI. Aceite: violação proposital falha com mensagem explicativa.
- [ ] **T03. Schema Prisma** — tabelas do design §3 com `@@map` para os nomes do legado, `DECIMAL(12,2)`, defaults e FKs. Aceite: `prisma migrate dev` cria o schema; REQ-CON-10 verificado por teste de schema.
- [ ] **T04. ETL MySQL → Postgres** — `tools/migrar-dados.mjs` (design §9), preservando ids, ajustando sequences, normalizando `statementable_type`, relatório `docs/relatorios/etl-contas.md` (arredondamentos, saldo × extrato, extratos órfãos). Aceite: contagens por tabela iguais; relatório gerado; responde DUV-CON-005.
- [ ] **T05. Formato HTTP compatível** — filtro de erros (422 `{campo:[msg]}`, 404, 401), serializer de datas Carbon e de `Decimal → number`. Aceite: testes unitários com amostras de `contrato.md`.
- [ ] **T06. Auth compatível** — `POST /api/access_token` (design §8): bcrypt `$2y$`, JWT HS256 60 min, 400/422 do legado, API não sobe sem `JWT_SECRET`. Aceite: login de `cliente1@user.com`/`secret` no banco migrado; teste de boot sem segredo falha.
- [ ] **T07. Tenant** — `ClienteContext`, guard e extensão do Prisma (design §4); sem contexto → erro. Aceite: teste estrutural (Prisma só em `shared/prisma` e `modules/*/infra`) + e2e cliente A × cliente B. **REQ-CON-07**.
- [ ] **T08. Fatias de leitura compatíveis** — `GET /api/bank_accounts`, `/:id`, `/lists`, `/api/category_expenses`, `/api/category_revenues`, `/api/statements` em `api/src/compat/`, com tenant. Aceite: formato igual a `contrato.md` (teste de contrato contra respostas capturadas do oráculo).

## Fase B — Módulo `contas` (gate: exige este arquivo aprovado)

- [ ] **T09. Domínio: vencimentos** — `domain/vencimentos.ts` + testes unitários (31/01 → 28/02, 31/03, 30/04; anual; N=0). **REQ-CON-03**.
- [ ] **T10. Domínio: movimentos** — `domain/movimentos.ts` com a tabela do design §5 inteira como testes unitários (pagar e receber). **REQ-CON-04, REQ-CON-05, REQ-CON-08, REQ-CON-09**.
- [ ] **T11. Domínio: busca BR** — `domain/busca.ts` (período `dd/mm/aaaa-dd/mm/aaaa`, valor `1.234,56`, texto; vazio → sem filtro). **REQ-CON-11** *(bloqueada até o ADR-004 ser aceito)*.
- [ ] **T12. Repositório + serviço transacional** — `infra/contas.repository.ts` e `application/contas.service.ts` (lock em ordem de id, conta + saldo + extrato numa transação). Aceite: teste de integração com falha injetada entre os passos → nada gravado. **REQ-CON-06**.
- [ ] **T13. HTTP: criar/ler/editar/excluir** — controllers `/api/bill_pays` e `/api/bill_receives`, DTOs (design §6), repetição com cópias em aberto. Aceite: `paridade --alvo novo` passa em `RN-CON-001`, `003-a-005`, `006`, `008`, `009`, `010`, `013-a-015`. **REQ-CON-01, REQ-CON-02, REQ-CON-03, REQ-CON-04, REQ-CON-05, REQ-CON-08, REQ-CON-09**.
- [ ] **T14. HTTP: listagem, busca e totais** — `GET` com paginação, `orderBy` restrito, `bill_data` com o mesmo filtro, `total_today`, `total_rest_of_month`. Aceite: `RN-CON-016-a-018` com `--alvo novo`. **REQ-CON-11, REQ-CON-12** *(bloqueada até o ADR-004 ser aceito)*.

## Fase C — Fechamento

- [ ] **T15. Gate completo no CI** — `paridade --alvo novo` e `rastreabilidade --strict` obrigatórios no PR. Aceite: CI verde.
- [ ] **T16. Revisão de segurança** — rodar `security-reviewer` no código de `api/`; achados altos viram tasks antes do merge.
- [ ] **T17. Documentação** — README (progresso), `docs/diario-de-bordo.md`, nota de estudo; atualizar `inventario.md` com o status do módulo.
