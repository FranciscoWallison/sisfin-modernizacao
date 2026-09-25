# Diário de bordo

> Registro cronológico de **cada passo** do case: objetivo, o que foi feito, evidências, descobertas e decisões.
> Decisões formais ficam nos ADRs (`.specs/decisoes/`); aqui fica o caminho até elas.
> Uma entrada nova por etapa, no mesmo commit da etapa.

---

## Etapa 0 — Estudo e escolha do case · 24/09/2026

**Objetivo:** estudar SDD e modernização de legado com agentes e escolher um repositório próprio para um case real.

- Estudo de [Shopify — Shop app migration](https://shopify.engineering/shop-app-migration) e [SoftDesign — Spec-Driven Development](https://www.softdesign.com.br/blog/spec-driven-development/), consolidado na nota
  `Arquitetura-de-Software/Modernizacao-de-Legado/spec-driven-modernizacao-com-ia.md` (repositório de estudos).
- Análise dos 150 repositórios próprios via `gh api` (tipos de arquivo, stack, READMEs). Ranking:
  🥇 `Laravel-Vue.js` (Laravel 5.3 + Vue 1, regras escondidas em listeners, multi-tenant, sem testes),
  🥈 `personal-react-native` (espelho do Shopify, pouca regra), 🥉 `EstoqueUTD` (bom para PoC).
- Nome: `sisfin-modernizacao` (`SisFin` é o namespace PHP do sistema).

## Etapa 1 — Oráculo e kit do processo · 24/09/2026

**Objetivo:** ter o legado rodando como oráculo e a estrutura `.claude/` + `.specs/`.

- `git subtree add --prefix=legacy` do `Laravel-Vue.js` (histórico preservado; repo original intacto).
- Varredura de segredos no código e no histórico (363 commits): nada encontrado. Repo público liberado.
- `docker-compose.yml`: PHP 7.1 (apt via `archive.debian.org`) + MySQL 5.7; migrations + seed na 1ª subida. Subiu na 1ª tentativa.
- Kit: `CLAUDE.md`, comandos (`/mapear-modulo`, `/extrair-regras`, `/spec-nova`), subagentes `arqueologo` e `security-reviewer` só-leitura, `deny` de edição em `legacy/`.
- **Sondas** (requisições reais no oráculo) → 12 regras do módulo `contas`. Achados:
  mover conta paga não move saldo (RN-CON-009); excluir conta paga não estorna (RN-CON-010);
  dinheiro em `FLOAT` (RN-CON-011); `->defalt(false)` numa migration (RN-CON-012).
- ADR-001: legado como oráculo + destino NestJS/Prisma/Postgres + Vue 3.

## Etapa 2 — Paridade reproduzível · 24/09/2026

**Objetivo:** transformar regras em testes executáveis contra qualquer implementação.

- `DeterministicSeeder` (fora de `legacy/`) fixa `mt_srand`/Faker → mesmo hash dos dados em dois resets.
- `tools/paridade.mjs`: casos só HTTP, criam os próprios dados, medem efeitos por **deltas**. 6 casos.
- Descoberta: conta criada paga com repetição → todas as parcelas nascem pagas e debitam hoje (DUV-CON-002).
- Erro meu corrigido pela sonda: "o admin não tem cliente" era falso (DUV-CON-006).

## Etapa 3 — Harness engineering · 25/09/2026

**Objetivo:** ambiente que deixe agentes implementarem com segurança (estudo de Böckeler/martinfowler.com e OpenAI).

- Hooks: pré-edição (oráculo só-leitura; código de módulo exige `tasks.md` aprovado com **hash**; agente não se autoaprova) e pós-edição (valida casos de paridade e IDs de regra; typecheck quando existir `api/`).
- `tools/oraculo-sql.mjs`: mostra o SQL que uma requisição dispara no legado. Provou a RN-CON-007 (conta e extrato fora da transação do saldo).
- `paridade.mjs --alvo novo`: aplica divergências aprovadas por ADR. Bug do próprio executor encontrado e corrigido (filtro descartava o 1º argumento).
- Testes do harness (`tools/testes/harness.test.mjs`, 5 testes) e CI (`.github/workflows/harness.yml`).
- Sondas de validação: sem categoria/conta → **500**; conta de outro cliente → 422; valor negativo aceito (RN-CON-013..015).
- `requirements.md` (REQ-CON-01..10) em rascunho; ADR-002 (harness) e ADR-003 (correções) propostos.
- Documentação e viabilidade: `docs/harness.md`.

## Etapa 4 — Aprovação, contrato, design e plano · 25/09/2026

**Objetivo:** fechar o TO-BE do módulo `contas` até o gate do `tasks.md`.

- **Aprovação do Francisco:** REQ-CON-01..10 e ADR-003 (manter N+1 na repetição; corrigir parcelas pagas, mover/excluir conta paga, `FLOAT`, 500 e valor negativo; transação única).
- Divergências do ADR-003 registradas nos casos → `paridade --alvo novo` contra o legado falha **exatamente** nos 4 casos corrigidos (meta do sistema novo).
- Mapeamento da listagem com `oraculo-sql`:
  - Sem busca, a lista vem **vazia**: o critério de valor BR converte `""` em `0` → `where value = 0` (RN-CON-016).
    O SPA sempre envia `search=` (`services/search-options.js`), então a tela ficaria vazia no oráculo.
  - `php -r` no container: `NumberFormatter::parse("")` → `0` com **ICU 63.1**. Provavelmente em 2017 devolvia `false`.
    **Lição: o oráculo reproduz o código, não necessariamente o ambiente original.**
  - `bill_data` ignora a busca por texto e erra a precedência `or … and done` (RN-CON-018).
  - Sem vazamento entre clientes: o `client_id` é aplicado com E por fora do `OR` (RN-CON-017).
- Adendo REQ-CON-11..12 + ADR-004 (listagem e totais) **propostos**.
- `contrato.md` com os formatos reais das respostas; `design.md` (camadas, tenant em ponto único, domínio puro de movimentos, transação com lock ordenado, ETL com relatório); `tasks.md` com 17 tasks em rascunho.
- Rastreabilidade pegou IDs abreviados no `tasks.md` (`REQ-CON-01, 02`) — o sensor funcionou; corrigido para IDs completos.
- Sensor inferencial: `security-reviewer` rodado sobre requirements + design — resultado na próxima entrada.

## Etapa 5 — Revisão de segurança das specs · 25/09/2026

**Objetivo:** passar requirements + design pelo sensor inferencial antes de aprovar o plano.

- `security-reviewer` (subagente só-leitura) → **12 achados** (4 altos, 7 médios, 1 baixo), registrados em
  `docs/revisoes/2026-09-25-security-contas.md`. Os que citavam o legado foram **conferidos** no código antes de aceitar.
- Os 4 altos:
  1. **Corrida no saldo** — a conta não era travada/relida na transação; dois pagamentos simultâneos debitariam duas vezes.
     Design §5 agora trava a conta primeiro e há teste de concorrência (T12).
  2. **Filtro de tenant incompleto** — extensão do Prisma não cobre SQL cru, `findUnique`, `*Many`, agregados, `connect`.
     Design §4 lista modelos e operações, proíbe raw fora de `infra/` sem `clientId`, e o e2e A × B cobre totais e `/compat`.
  3. **Perda do lockout e do rate limit do login** que o legado tinha.
  4. **JWT sem algoritmo fixo e sem revogação.**
- Sondas para os itens 3 e 4 viraram regras do módulo `auth` (`RN-AUT-001..003`) e um caso de paridade:
  5 logins errados → 400; 6º → **403** "Too many login attempts"; logout → token seguinte **401**; `X-RateLimit-Limit: 60`;
  payload do JWT sem `client_id` (só `sub` e `user{id,name,email}`).
- **O harness tropeçou em dois problemas reais e foi corrigido:**
  - Rodar a suíte várias vezes seguidas bateu no rate limit do próprio legado (**429**). `tools/lib/api.mjs` agora
    respeita `Retry-After` e avisa no stderr.
  - No Windows, `process.exit()` com sockets do `fetch` abertos derrubava o Node (assert em `src\win\async.c`, código 127).
    `paridade.mjs` usa `process.exitCode`.
- Adendo **REQ-CON-13** (segurança transversal) e **ADR-005** (auth-compat completo junto com `contas`; claim `user` no
  JWT como risco aceito até o front novo) — **propostos**. `design.md` e `tasks.md` atualizados (T05–T07, T12–T14 maiores; T17 nova).
- Estado: 9 casos de paridade passando contra o legado; rastreabilidade sem órfãos de requisito ou task.

## Etapa 6 — Fechamento do AS-IS de `contas` · 25/09/2026

**Objetivo:** enquanto o plano aguarda aprovação (o gate impede implementar tasks de um `tasks.md` em rascunho),
responder as dúvidas que restavam e deixar a rastreabilidade sem nenhuma pendência.

- **DUV-CON-005** (saldo × extrato): consulta no banco do oráculo → **0 de 50** contas divergem. A falha da RN-CON-007 é
  teórica. Mas saldo e extrato concordam **também no erro** das RN-CON-009/010 — o extrato espelha o bug. 19 extratos
  órfãos, todos gerados pelos próprios casos de exclusão.
- **DUV-CON-006** (usuário sem cliente): usuário `sem-cliente@sonda.local` inserido via SQL **no banco do oráculo**
  (dado de teste; some no próximo reset) → login **200**, e toda rota com tenant → **500**
  (`TenantNullIdException`). Não vaza dados (falha fechada), mas com erro de servidor → **RN-CON-019**, ligada ao
  REQ-CON-13 (sistema novo: login recusado e 403).
- Regras que HTTP não enxerga (RN-CON-007 transação, 011 tipo de coluna, 012 default, 019 preparo via SQL) ganharam
  `**Paridade:** n/a — … (Txx)`, dizendo qual task as cobre. `rastreabilidade.mjs` passou a entender isso e a falhar
  se a justificativa não citar uma task.
- Resultado: `rastreabilidade --strict` **passa** (nenhuma regra sem requisito, sem cobertura ou requisito sem task) →
  ligado como obrigatório no CI.
- Todas as 9 dúvidas do módulo estão respondidas ou decididas.

**Próximo passo:** Francisco revisa `design.md`, `tasks.md`, ADR-004 e ADR-005 (e o adendo REQ-CON-11..13) e aprova o
plano com `node tools/aprovar-tasks.mjs contas "Francisco"`. Depois, Fase A (T01–T08).

## Etapa 7 — Plano aprovado; Fase A: T01 e T03 · 25/09/2026

**Objetivo:** começar a implementação pela fundação (API no ar e schema).

- **Aprovação:** `node tools/aprovar-tasks.mjs contas "Francisco"` → hash `d854ed6545ef`. Junto: design, ADR-004,
  ADR-005 e o adendo REQ-CON-11..13 marcados como aceitos.
- **Consequência do gate por hash:** marcar `[x]` no `tasks.md` mudaria o hash e derrubaria a aprovação.
  O andamento fica em `.specs/novo/contas/progresso.md`.
- **Versões:** NestJS **11.2.6** (a 12 é recente e muda a base de módulos) e Prisma **6.19.3** (o `latest` do Prisma é
  um RC da v8). Registrado em "Mudanças após a aprovação" no `design.md`.
- **T01 — esqueleto:** `api/` com Nest + TypeScript strict, `/health`, Dockerfile multi-stage que aplica as migrations
  no boot; serviços `api` e `api-db` (Postgres 16) no compose.
  Tropeço: o host devolveu **404** em `localhost:3000` com o container saudável — havia outro processo `node`
  local ouvindo em `::1:3000`. Não mexi nele; a API foi para a porta **3300** do host.
  Aceite: `curl localhost:3300/health` → `{"status":"ok"}` **200** + teste e2e.
- **T03 — schema:** `prisma/schema.prisma` com os nomes do legado (`@@map`), `DECIMAL(12,2)`, `done` default false,
  `statements.client_id` + `kind`/`user_id`/`action`, FK de categoria por tipo. Migration `inicial` aplicada.
  Aceite: `test/schema.spec.ts` — 10 testes sobre o SQL gerado.
  **Descoberta:** ao ler o `information_schema` do oráculo, o dinheiro é `DOUBLE(8,2)`, não `FLOAT` — ponto flutuante
  com teto escondido de **999.999,99**. RN-CON-011 corrigida (com nota da correção).
- **Nota de harness:** esta sessão do agente roda a partir do repositório de estudos, então os hooks do
  `.claude/settings.json` do sisfin **não disparam para mim**; rodo os sensores (`tsc`, testes, rastreabilidade) manualmente
  a cada task. Numa sessão aberta dentro do sisfin, eles disparam sozinhos.

**Próximo passo:** T02 (sensores de arquitetura) e T04 (ETL).

## Etapa 8 — T02: sensores de arquitetura · 25/09/2026

**Objetivo:** tornar as regras de camadas do design verificáveis por máquina, com mensagens que ensinem o agente.

- `api/.dependency-cruiser.cjs`: `dominio-puro`, `http-so-fala-com-application`, `prisma-so-em-infra`, `sem-ciclos`.
  Cada regra tem um `comment` que diz **o que fazer** (ex.: "Crie/use um repositório em infra/"); a saída `err-long`
  o mostra — a saída padrão `err` não mostrava, e o teste pegou isso.
- Lint de SQL cru (`test/arquitetura.spec.ts`): `$queryRaw`/`$executeRaw` só em `*/infra/**` com `clientId: number`;
  variantes `*Unsafe` proibidas (revisão de segurança #2).
- Aceite: fixture com `domain/` importando o Prisma falha com as duas regras **e** a mensagem de correção.
- Hook pós-edição passou a rodar `tsc` + `depcruise` em `api/`: ~4 s por edição.
- **Bug no sensor dormente:** o typecheck do hook foi escrito antes de `api/` existir e rodava `npx tsc` a partir da raiz,
  onde o TypeScript não está instalado — o `npx` baixava um pacote chamado "tsc" que **não é o compilador** e todo
  arquivo "falhava". Só apareceu ao ativar. Corrigido (`cwd` no projeto + `--no-install`). Lição: sensor que nunca rodou
  não está testado.
- CI: novo job `api` (typecheck, camadas, jest).

## Etapa 9 — T04: migração de dados (ETL) · 25/09/2026

**Objetivo:** o banco novo nasce dos **mesmos dados** do oráculo, para os mesmos casos de paridade rodarem nos dois lados.

- `tools/migrar-dados.mjs` (drivers `mysql2` e `pg` em `tools/package.json`): tabela a tabela na ordem das FKs,
  **preservando ids**, numa transação única (erro → rollback, nada gravado); ajusta as sequences.
  Converte `tinyint` → boolean, `DOUBLE(8,2)` → texto decimal de 2 casas, `SisFinModelsBillPay` → `BillPay`.
- Proteção: só grava em banco local (o ETL faz `TRUNCATE`), salvo `--permitir-remoto`.
- Relatório com **só ids e valores** (revisão #12): contagens, arredondamentos, saldo × extrato, órfãos, usuários sem cliente.
  `--seed` → `docs/relatorios/etl-seed.md` (versionado, dados fictícios); sem flag → `.relatorios/` (fora do git).
- Oráculo **resetado** antes (as sondas tinham deixado dados de teste) → 1.135 linhas em 9 tabelas, contagens iguais,
  0 arredondamentos, 0 divergências saldo × extrato, 0 órfãos.
- Prova dos detectores: rodei a suíte de paridade (que exclui uma conta paga) e o ETL de novo → **1 órfão** detectado.
- Limite honesto: o detector de arredondamento **não foi exercitado** — o seed só tem valores inteiros.

## Etapa 10 — T05 formato HTTP e T06 auth compatível · 25/09/2026

**Objetivo:** a API nova falar HTTP como o legado (formatos, erros) e autenticar com os mesmos controles de segurança.

- **T05:** `ValidationPipe` com whitelist + `forbidNonWhitelisted` + `stopAtFirstError` → 422 `{campo:[msg]}` (uma mensagem por
  campo, como o "bail" do Laravel); filtro global com mapeamento fechado (P2025 → 404; P2002/P2003 → 422; resto → 500
  "Server Error" + id de correlação, SQL só no log) — o erro do Prisma é detectado **pelo formato**, sem importar o Prisma
  em `shared/http` (a regra de camadas da T02 obrigou esse desenho); boot recusa segredo < 32 bytes e `DEBUG_SQL` fora de dev;
  CORS por allowlist; serializadores Carbon e Decimal. 11 testes.
- **T06:** `POST /api/access_token`, `POST /api/logout`, `GET /api/user` compatíveis (formato capturado do oráculo:
  `/api/user` traz o `client`; 401 é `{"error":"Unauthenticated."}` — adicionado ao `contrato.md`).
  JWT HS256 fixo com claims obrigatórias; cliente resolvido **pelo `sub` no banco**; usuário sem cliente não loga;
  hash `$2y# Diário de bordo

> Registro cronológico de **cada passo** do case: objetivo, o que foi feito, evidências, descobertas e decisões.
> Decisões formais ficam nos ADRs (`.specs/decisoes/`); aqui fica o caminho até elas.
> Uma entrada nova por etapa, no mesmo commit da etapa.

---

## Etapa 0 — Estudo e escolha do case · 24/09/2026

**Objetivo:** estudar SDD e modernização de legado com agentes e escolher um repositório próprio para um case real.

- Estudo de [Shopify — Shop app migration](https://shopify.engineering/shop-app-migration) e [SoftDesign — Spec-Driven Development](https://www.softdesign.com.br/blog/spec-driven-development/), consolidado na nota
  `Arquitetura-de-Software/Modernizacao-de-Legado/spec-driven-modernizacao-com-ia.md` (repositório de estudos).
- Análise dos 150 repositórios próprios via `gh api` (tipos de arquivo, stack, READMEs). Ranking:
  🥇 `Laravel-Vue.js` (Laravel 5.3 + Vue 1, regras escondidas em listeners, multi-tenant, sem testes),
  🥈 `personal-react-native` (espelho do Shopify, pouca regra), 🥉 `EstoqueUTD` (bom para PoC).
- Nome: `sisfin-modernizacao` (`SisFin` é o namespace PHP do sistema).

## Etapa 1 — Oráculo e kit do processo · 24/09/2026

**Objetivo:** ter o legado rodando como oráculo e a estrutura `.claude/` + `.specs/`.

- `git subtree add --prefix=legacy` do `Laravel-Vue.js` (histórico preservado; repo original intacto).
- Varredura de segredos no código e no histórico (363 commits): nada encontrado. Repo público liberado.
- `docker-compose.yml`: PHP 7.1 (apt via `archive.debian.org`) + MySQL 5.7; migrations + seed na 1ª subida. Subiu na 1ª tentativa.
- Kit: `CLAUDE.md`, comandos (`/mapear-modulo`, `/extrair-regras`, `/spec-nova`), subagentes `arqueologo` e `security-reviewer` só-leitura, `deny` de edição em `legacy/`.
- **Sondas** (requisições reais no oráculo) → 12 regras do módulo `contas`. Achados:
  mover conta paga não move saldo (RN-CON-009); excluir conta paga não estorna (RN-CON-010);
  dinheiro em `FLOAT` (RN-CON-011); `->defalt(false)` numa migration (RN-CON-012).
- ADR-001: legado como oráculo + destino NestJS/Prisma/Postgres + Vue 3.

## Etapa 2 — Paridade reproduzível · 24/09/2026

**Objetivo:** transformar regras em testes executáveis contra qualquer implementação.

- `DeterministicSeeder` (fora de `legacy/`) fixa `mt_srand`/Faker → mesmo hash dos dados em dois resets.
- `tools/paridade.mjs`: casos só HTTP, criam os próprios dados, medem efeitos por **deltas**. 6 casos.
- Descoberta: conta criada paga com repetição → todas as parcelas nascem pagas e debitam hoje (DUV-CON-002).
- Erro meu corrigido pela sonda: "o admin não tem cliente" era falso (DUV-CON-006).

## Etapa 3 — Harness engineering · 25/09/2026

**Objetivo:** ambiente que deixe agentes implementarem com segurança (estudo de Böckeler/martinfowler.com e OpenAI).

- Hooks: pré-edição (oráculo só-leitura; código de módulo exige `tasks.md` aprovado com **hash**; agente não se autoaprova) e pós-edição (valida casos de paridade e IDs de regra; typecheck quando existir `api/`).
- `tools/oraculo-sql.mjs`: mostra o SQL que uma requisição dispara no legado. Provou a RN-CON-007 (conta e extrato fora da transação do saldo).
- `paridade.mjs --alvo novo`: aplica divergências aprovadas por ADR. Bug do próprio executor encontrado e corrigido (filtro descartava o 1º argumento).
- Testes do harness (`tools/testes/harness.test.mjs`, 5 testes) e CI (`.github/workflows/harness.yml`).
- Sondas de validação: sem categoria/conta → **500**; conta de outro cliente → 422; valor negativo aceito (RN-CON-013..015).
- `requirements.md` (REQ-CON-01..10) em rascunho; ADR-002 (harness) e ADR-003 (correções) propostos.
- Documentação e viabilidade: `docs/harness.md`.

## Etapa 4 — Aprovação, contrato, design e plano · 25/09/2026

**Objetivo:** fechar o TO-BE do módulo `contas` até o gate do `tasks.md`.

- **Aprovação do Francisco:** REQ-CON-01..10 e ADR-003 (manter N+1 na repetição; corrigir parcelas pagas, mover/excluir conta paga, `FLOAT`, 500 e valor negativo; transação única).
- Divergências do ADR-003 registradas nos casos → `paridade --alvo novo` contra o legado falha **exatamente** nos 4 casos corrigidos (meta do sistema novo).
- Mapeamento da listagem com `oraculo-sql`:
  - Sem busca, a lista vem **vazia**: o critério de valor BR converte `""` em `0` → `where value = 0` (RN-CON-016).
    O SPA sempre envia `search=` (`services/search-options.js`), então a tela ficaria vazia no oráculo.
  - `php -r` no container: `NumberFormatter::parse("")` → `0` com **ICU 63.1**. Provavelmente em 2017 devolvia `false`.
    **Lição: o oráculo reproduz o código, não necessariamente o ambiente original.**
  - `bill_data` ignora a busca por texto e erra a precedência `or … and done` (RN-CON-018).
  - Sem vazamento entre clientes: o `client_id` é aplicado com E por fora do `OR` (RN-CON-017).
- Adendo REQ-CON-11..12 + ADR-004 (listagem e totais) **propostos**.
- `contrato.md` com os formatos reais das respostas; `design.md` (camadas, tenant em ponto único, domínio puro de movimentos, transação com lock ordenado, ETL com relatório); `tasks.md` com 17 tasks em rascunho.
- Rastreabilidade pegou IDs abreviados no `tasks.md` (`REQ-CON-01, 02`) — o sensor funcionou; corrigido para IDs completos.
- Sensor inferencial: `security-reviewer` rodado sobre requirements + design — resultado na próxima entrada.

## Etapa 5 — Revisão de segurança das specs · 25/09/2026

**Objetivo:** passar requirements + design pelo sensor inferencial antes de aprovar o plano.

- `security-reviewer` (subagente só-leitura) → **12 achados** (4 altos, 7 médios, 1 baixo), registrados em
  `docs/revisoes/2026-09-25-security-contas.md`. Os que citavam o legado foram **conferidos** no código antes de aceitar.
- Os 4 altos:
  1. **Corrida no saldo** — a conta não era travada/relida na transação; dois pagamentos simultâneos debitariam duas vezes.
     Design §5 agora trava a conta primeiro e há teste de concorrência (T12).
  2. **Filtro de tenant incompleto** — extensão do Prisma não cobre SQL cru, `findUnique`, `*Many`, agregados, `connect`.
     Design §4 lista modelos e operações, proíbe raw fora de `infra/` sem `clientId`, e o e2e A × B cobre totais e `/compat`.
  3. **Perda do lockout e do rate limit do login** que o legado tinha.
  4. **JWT sem algoritmo fixo e sem revogação.**
- Sondas para os itens 3 e 4 viraram regras do módulo `auth` (`RN-AUT-001..003`) e um caso de paridade:
  5 logins errados → 400; 6º → **403** "Too many login attempts"; logout → token seguinte **401**; `X-RateLimit-Limit: 60`;
  payload do JWT sem `client_id` (só `sub` e `user{id,name,email}`).
- **O harness tropeçou em dois problemas reais e foi corrigido:**
  - Rodar a suíte várias vezes seguidas bateu no rate limit do próprio legado (**429**). `tools/lib/api.mjs` agora
    respeita `Retry-After` e avisa no stderr.
  - No Windows, `process.exit()` com sockets do `fetch` abertos derrubava o Node (assert em `src\win\async.c`, código 127).
    `paridade.mjs` usa `process.exitCode`.
- Adendo **REQ-CON-13** (segurança transversal) e **ADR-005** (auth-compat completo junto com `contas`; claim `user` no
  JWT como risco aceito até o front novo) — **propostos**. `design.md` e `tasks.md` atualizados (T05–T07, T12–T14 maiores; T17 nova).
- Estado: 9 casos de paridade passando contra o legado; rastreabilidade sem órfãos de requisito ou task.

## Etapa 6 — Fechamento do AS-IS de `contas` · 25/09/2026

**Objetivo:** enquanto o plano aguarda aprovação (o gate impede implementar tasks de um `tasks.md` em rascunho),
responder as dúvidas que restavam e deixar a rastreabilidade sem nenhuma pendência.

- **DUV-CON-005** (saldo × extrato): consulta no banco do oráculo → **0 de 50** contas divergem. A falha da RN-CON-007 é
  teórica. Mas saldo e extrato concordam **também no erro** das RN-CON-009/010 — o extrato espelha o bug. 19 extratos
  órfãos, todos gerados pelos próprios casos de exclusão.
- **DUV-CON-006** (usuário sem cliente): usuário `sem-cliente@sonda.local` inserido via SQL **no banco do oráculo**
  (dado de teste; some no próximo reset) → login **200**, e toda rota com tenant → **500**
  (`TenantNullIdException`). Não vaza dados (falha fechada), mas com erro de servidor → **RN-CON-019**, ligada ao
  REQ-CON-13 (sistema novo: login recusado e 403).
- Regras que HTTP não enxerga (RN-CON-007 transação, 011 tipo de coluna, 012 default, 019 preparo via SQL) ganharam
  `**Paridade:** n/a — … (Txx)`, dizendo qual task as cobre. `rastreabilidade.mjs` passou a entender isso e a falhar
  se a justificativa não citar uma task.
- Resultado: `rastreabilidade --strict` **passa** (nenhuma regra sem requisito, sem cobertura ou requisito sem task) →
  ligado como obrigatório no CI.
- Todas as 9 dúvidas do módulo estão respondidas ou decididas.

**Próximo passo:** Francisco revisa `design.md`, `tasks.md`, ADR-004 e ADR-005 (e o adendo REQ-CON-11..13) e aprova o
plano com `node tools/aprovar-tasks.mjs contas "Francisco"`. Depois, Fase A (T01–T08).

## Etapa 7 — Plano aprovado; Fase A: T01 e T03 · 25/09/2026

**Objetivo:** começar a implementação pela fundação (API no ar e schema).

- **Aprovação:** `node tools/aprovar-tasks.mjs contas "Francisco"` → hash `d854ed6545ef`. Junto: design, ADR-004,
  ADR-005 e o adendo REQ-CON-11..13 marcados como aceitos.
- **Consequência do gate por hash:** marcar `[x]` no `tasks.md` mudaria o hash e derrubaria a aprovação.
  O andamento fica em `.specs/novo/contas/progresso.md`.
- **Versões:** NestJS **11.2.6** (a 12 é recente e muda a base de módulos) e Prisma **6.19.3** (o `latest` do Prisma é
  um RC da v8). Registrado em "Mudanças após a aprovação" no `design.md`.
- **T01 — esqueleto:** `api/` com Nest + TypeScript strict, `/health`, Dockerfile multi-stage que aplica as migrations
  no boot; serviços `api` e `api-db` (Postgres 16) no compose.
  Tropeço: o host devolveu **404** em `localhost:3000` com o container saudável — havia outro processo `node`
  local ouvindo em `::1:3000`. Não mexi nele; a API foi para a porta **3300** do host.
  Aceite: `curl localhost:3300/health` → `{"status":"ok"}` **200** + teste e2e.
- **T03 — schema:** `prisma/schema.prisma` com os nomes do legado (`@@map`), `DECIMAL(12,2)`, `done` default false,
  `statements.client_id` + `kind`/`user_id`/`action`, FK de categoria por tipo. Migration `inicial` aplicada.
  Aceite: `test/schema.spec.ts` — 10 testes sobre o SQL gerado.
  **Descoberta:** ao ler o `information_schema` do oráculo, o dinheiro é `DOUBLE(8,2)`, não `FLOAT` — ponto flutuante
  com teto escondido de **999.999,99**. RN-CON-011 corrigida (com nota da correção).
- **Nota de harness:** esta sessão do agente roda a partir do repositório de estudos, então os hooks do
  `.claude/settings.json` do sisfin **não disparam para mim**; rodo os sensores (`tsc`, testes, rastreabilidade) manualmente
  a cada task. Numa sessão aberta dentro do sisfin, eles disparam sozinhos.

**Próximo passo:** T02 (sensores de arquitetura) e T04 (ETL).

## Etapa 8 — T02: sensores de arquitetura · 25/09/2026

**Objetivo:** tornar as regras de camadas do design verificáveis por máquina, com mensagens que ensinem o agente.

- `api/.dependency-cruiser.cjs`: `dominio-puro`, `http-so-fala-com-application`, `prisma-so-em-infra`, `sem-ciclos`.
  Cada regra tem um `comment` que diz **o que fazer** (ex.: "Crie/use um repositório em infra/"); a saída `err-long`
  o mostra — a saída padrão `err` não mostrava, e o teste pegou isso.
- Lint de SQL cru (`test/arquitetura.spec.ts`): `$queryRaw`/`$executeRaw` só em `*/infra/**` com `clientId: number`;
  variantes `*Unsafe` proibidas (revisão de segurança #2).
- Aceite: fixture com `domain/` importando o Prisma falha com as duas regras **e** a mensagem de correção.
- Hook pós-edição passou a rodar `tsc` + `depcruise` em `api/`: ~4 s por edição.
- **Bug no sensor dormente:** o typecheck do hook foi escrito antes de `api/` existir e rodava `npx tsc` a partir da raiz,
  onde o TypeScript não está instalado — o `npx` baixava um pacote chamado "tsc" que **não é o compilador** e todo
  arquivo "falhava". Só apareceu ao ativar. Corrigido (`cwd` no projeto + `--no-install`). Lição: sensor que nunca rodou
  não está testado.
- CI: novo job `api` (typecheck, camadas, jest).

## Etapa 9 — T04: migração de dados (ETL) · 25/09/2026

**Objetivo:** o banco novo nasce dos **mesmos dados** do oráculo, para os mesmos casos de paridade rodarem nos dois lados.

- `tools/migrar-dados.mjs` (drivers `mysql2` e `pg` em `tools/package.json`): tabela a tabela na ordem das FKs,
  **preservando ids**, numa transação única (erro → rollback, nada gravado); ajusta as sequences.
  Converte `tinyint` → boolean, `DOUBLE(8,2)` → texto decimal de 2 casas, `SisFinModelsBillPay` → `BillPay`.
- Proteção: só grava em banco local (o ETL faz `TRUNCATE`), salvo `--permitir-remoto`.
- Relatório com **só ids e valores** (revisão #12): contagens, arredondamentos, saldo × extrato, órfãos, usuários sem cliente.
  `--seed` → `docs/relatorios/etl-seed.md` (versionado, dados fictícios); sem flag → `.relatorios/` (fora do git).
- Oráculo **resetado** antes (as sondas tinham deixado dados de teste) → 1.135 linhas em 9 tabelas, contagens iguais,
  0 arredondamentos, 0 divergências saldo × extrato, 0 órfãos.
- Prova dos detectores: rodei a suíte de paridade (que exclui uma conta paga) e o ETL de novo → **1 órfão** detectado.
- Limite honesto: o detector de arredondamento **não foi exercitado** — o seed só tem valores inteiros.
 do PHP aceito trocando o prefixo por `$2b# Diário de bordo

> Registro cronológico de **cada passo** do case: objetivo, o que foi feito, evidências, descobertas e decisões.
> Decisões formais ficam nos ADRs (`.specs/decisoes/`); aqui fica o caminho até elas.
> Uma entrada nova por etapa, no mesmo commit da etapa.

---

## Etapa 0 — Estudo e escolha do case · 24/09/2026

**Objetivo:** estudar SDD e modernização de legado com agentes e escolher um repositório próprio para um case real.

- Estudo de [Shopify — Shop app migration](https://shopify.engineering/shop-app-migration) e [SoftDesign — Spec-Driven Development](https://www.softdesign.com.br/blog/spec-driven-development/), consolidado na nota
  `Arquitetura-de-Software/Modernizacao-de-Legado/spec-driven-modernizacao-com-ia.md` (repositório de estudos).
- Análise dos 150 repositórios próprios via `gh api` (tipos de arquivo, stack, READMEs). Ranking:
  🥇 `Laravel-Vue.js` (Laravel 5.3 + Vue 1, regras escondidas em listeners, multi-tenant, sem testes),
  🥈 `personal-react-native` (espelho do Shopify, pouca regra), 🥉 `EstoqueUTD` (bom para PoC).
- Nome: `sisfin-modernizacao` (`SisFin` é o namespace PHP do sistema).

## Etapa 1 — Oráculo e kit do processo · 24/09/2026

**Objetivo:** ter o legado rodando como oráculo e a estrutura `.claude/` + `.specs/`.

- `git subtree add --prefix=legacy` do `Laravel-Vue.js` (histórico preservado; repo original intacto).
- Varredura de segredos no código e no histórico (363 commits): nada encontrado. Repo público liberado.
- `docker-compose.yml`: PHP 7.1 (apt via `archive.debian.org`) + MySQL 5.7; migrations + seed na 1ª subida. Subiu na 1ª tentativa.
- Kit: `CLAUDE.md`, comandos (`/mapear-modulo`, `/extrair-regras`, `/spec-nova`), subagentes `arqueologo` e `security-reviewer` só-leitura, `deny` de edição em `legacy/`.
- **Sondas** (requisições reais no oráculo) → 12 regras do módulo `contas`. Achados:
  mover conta paga não move saldo (RN-CON-009); excluir conta paga não estorna (RN-CON-010);
  dinheiro em `FLOAT` (RN-CON-011); `->defalt(false)` numa migration (RN-CON-012).
- ADR-001: legado como oráculo + destino NestJS/Prisma/Postgres + Vue 3.

## Etapa 2 — Paridade reproduzível · 24/09/2026

**Objetivo:** transformar regras em testes executáveis contra qualquer implementação.

- `DeterministicSeeder` (fora de `legacy/`) fixa `mt_srand`/Faker → mesmo hash dos dados em dois resets.
- `tools/paridade.mjs`: casos só HTTP, criam os próprios dados, medem efeitos por **deltas**. 6 casos.
- Descoberta: conta criada paga com repetição → todas as parcelas nascem pagas e debitam hoje (DUV-CON-002).
- Erro meu corrigido pela sonda: "o admin não tem cliente" era falso (DUV-CON-006).

## Etapa 3 — Harness engineering · 25/09/2026

**Objetivo:** ambiente que deixe agentes implementarem com segurança (estudo de Böckeler/martinfowler.com e OpenAI).

- Hooks: pré-edição (oráculo só-leitura; código de módulo exige `tasks.md` aprovado com **hash**; agente não se autoaprova) e pós-edição (valida casos de paridade e IDs de regra; typecheck quando existir `api/`).
- `tools/oraculo-sql.mjs`: mostra o SQL que uma requisição dispara no legado. Provou a RN-CON-007 (conta e extrato fora da transação do saldo).
- `paridade.mjs --alvo novo`: aplica divergências aprovadas por ADR. Bug do próprio executor encontrado e corrigido (filtro descartava o 1º argumento).
- Testes do harness (`tools/testes/harness.test.mjs`, 5 testes) e CI (`.github/workflows/harness.yml`).
- Sondas de validação: sem categoria/conta → **500**; conta de outro cliente → 422; valor negativo aceito (RN-CON-013..015).
- `requirements.md` (REQ-CON-01..10) em rascunho; ADR-002 (harness) e ADR-003 (correções) propostos.
- Documentação e viabilidade: `docs/harness.md`.

## Etapa 4 — Aprovação, contrato, design e plano · 25/09/2026

**Objetivo:** fechar o TO-BE do módulo `contas` até o gate do `tasks.md`.

- **Aprovação do Francisco:** REQ-CON-01..10 e ADR-003 (manter N+1 na repetição; corrigir parcelas pagas, mover/excluir conta paga, `FLOAT`, 500 e valor negativo; transação única).
- Divergências do ADR-003 registradas nos casos → `paridade --alvo novo` contra o legado falha **exatamente** nos 4 casos corrigidos (meta do sistema novo).
- Mapeamento da listagem com `oraculo-sql`:
  - Sem busca, a lista vem **vazia**: o critério de valor BR converte `""` em `0` → `where value = 0` (RN-CON-016).
    O SPA sempre envia `search=` (`services/search-options.js`), então a tela ficaria vazia no oráculo.
  - `php -r` no container: `NumberFormatter::parse("")` → `0` com **ICU 63.1**. Provavelmente em 2017 devolvia `false`.
    **Lição: o oráculo reproduz o código, não necessariamente o ambiente original.**
  - `bill_data` ignora a busca por texto e erra a precedência `or … and done` (RN-CON-018).
  - Sem vazamento entre clientes: o `client_id` é aplicado com E por fora do `OR` (RN-CON-017).
- Adendo REQ-CON-11..12 + ADR-004 (listagem e totais) **propostos**.
- `contrato.md` com os formatos reais das respostas; `design.md` (camadas, tenant em ponto único, domínio puro de movimentos, transação com lock ordenado, ETL com relatório); `tasks.md` com 17 tasks em rascunho.
- Rastreabilidade pegou IDs abreviados no `tasks.md` (`REQ-CON-01, 02`) — o sensor funcionou; corrigido para IDs completos.
- Sensor inferencial: `security-reviewer` rodado sobre requirements + design — resultado na próxima entrada.

## Etapa 5 — Revisão de segurança das specs · 25/09/2026

**Objetivo:** passar requirements + design pelo sensor inferencial antes de aprovar o plano.

- `security-reviewer` (subagente só-leitura) → **12 achados** (4 altos, 7 médios, 1 baixo), registrados em
  `docs/revisoes/2026-09-25-security-contas.md`. Os que citavam o legado foram **conferidos** no código antes de aceitar.
- Os 4 altos:
  1. **Corrida no saldo** — a conta não era travada/relida na transação; dois pagamentos simultâneos debitariam duas vezes.
     Design §5 agora trava a conta primeiro e há teste de concorrência (T12).
  2. **Filtro de tenant incompleto** — extensão do Prisma não cobre SQL cru, `findUnique`, `*Many`, agregados, `connect`.
     Design §4 lista modelos e operações, proíbe raw fora de `infra/` sem `clientId`, e o e2e A × B cobre totais e `/compat`.
  3. **Perda do lockout e do rate limit do login** que o legado tinha.
  4. **JWT sem algoritmo fixo e sem revogação.**
- Sondas para os itens 3 e 4 viraram regras do módulo `auth` (`RN-AUT-001..003`) e um caso de paridade:
  5 logins errados → 400; 6º → **403** "Too many login attempts"; logout → token seguinte **401**; `X-RateLimit-Limit: 60`;
  payload do JWT sem `client_id` (só `sub` e `user{id,name,email}`).
- **O harness tropeçou em dois problemas reais e foi corrigido:**
  - Rodar a suíte várias vezes seguidas bateu no rate limit do próprio legado (**429**). `tools/lib/api.mjs` agora
    respeita `Retry-After` e avisa no stderr.
  - No Windows, `process.exit()` com sockets do `fetch` abertos derrubava o Node (assert em `src\win\async.c`, código 127).
    `paridade.mjs` usa `process.exitCode`.
- Adendo **REQ-CON-13** (segurança transversal) e **ADR-005** (auth-compat completo junto com `contas`; claim `user` no
  JWT como risco aceito até o front novo) — **propostos**. `design.md` e `tasks.md` atualizados (T05–T07, T12–T14 maiores; T17 nova).
- Estado: 9 casos de paridade passando contra o legado; rastreabilidade sem órfãos de requisito ou task.

## Etapa 6 — Fechamento do AS-IS de `contas` · 25/09/2026

**Objetivo:** enquanto o plano aguarda aprovação (o gate impede implementar tasks de um `tasks.md` em rascunho),
responder as dúvidas que restavam e deixar a rastreabilidade sem nenhuma pendência.

- **DUV-CON-005** (saldo × extrato): consulta no banco do oráculo → **0 de 50** contas divergem. A falha da RN-CON-007 é
  teórica. Mas saldo e extrato concordam **também no erro** das RN-CON-009/010 — o extrato espelha o bug. 19 extratos
  órfãos, todos gerados pelos próprios casos de exclusão.
- **DUV-CON-006** (usuário sem cliente): usuário `sem-cliente@sonda.local` inserido via SQL **no banco do oráculo**
  (dado de teste; some no próximo reset) → login **200**, e toda rota com tenant → **500**
  (`TenantNullIdException`). Não vaza dados (falha fechada), mas com erro de servidor → **RN-CON-019**, ligada ao
  REQ-CON-13 (sistema novo: login recusado e 403).
- Regras que HTTP não enxerga (RN-CON-007 transação, 011 tipo de coluna, 012 default, 019 preparo via SQL) ganharam
  `**Paridade:** n/a — … (Txx)`, dizendo qual task as cobre. `rastreabilidade.mjs` passou a entender isso e a falhar
  se a justificativa não citar uma task.
- Resultado: `rastreabilidade --strict` **passa** (nenhuma regra sem requisito, sem cobertura ou requisito sem task) →
  ligado como obrigatório no CI.
- Todas as 9 dúvidas do módulo estão respondidas ou decididas.

**Próximo passo:** Francisco revisa `design.md`, `tasks.md`, ADR-004 e ADR-005 (e o adendo REQ-CON-11..13) e aprova o
plano com `node tools/aprovar-tasks.mjs contas "Francisco"`. Depois, Fase A (T01–T08).

## Etapa 7 — Plano aprovado; Fase A: T01 e T03 · 25/09/2026

**Objetivo:** começar a implementação pela fundação (API no ar e schema).

- **Aprovação:** `node tools/aprovar-tasks.mjs contas "Francisco"` → hash `d854ed6545ef`. Junto: design, ADR-004,
  ADR-005 e o adendo REQ-CON-11..13 marcados como aceitos.
- **Consequência do gate por hash:** marcar `[x]` no `tasks.md` mudaria o hash e derrubaria a aprovação.
  O andamento fica em `.specs/novo/contas/progresso.md`.
- **Versões:** NestJS **11.2.6** (a 12 é recente e muda a base de módulos) e Prisma **6.19.3** (o `latest` do Prisma é
  um RC da v8). Registrado em "Mudanças após a aprovação" no `design.md`.
- **T01 — esqueleto:** `api/` com Nest + TypeScript strict, `/health`, Dockerfile multi-stage que aplica as migrations
  no boot; serviços `api` e `api-db` (Postgres 16) no compose.
  Tropeço: o host devolveu **404** em `localhost:3000` com o container saudável — havia outro processo `node`
  local ouvindo em `::1:3000`. Não mexi nele; a API foi para a porta **3300** do host.
  Aceite: `curl localhost:3300/health` → `{"status":"ok"}` **200** + teste e2e.
- **T03 — schema:** `prisma/schema.prisma` com os nomes do legado (`@@map`), `DECIMAL(12,2)`, `done` default false,
  `statements.client_id` + `kind`/`user_id`/`action`, FK de categoria por tipo. Migration `inicial` aplicada.
  Aceite: `test/schema.spec.ts` — 10 testes sobre o SQL gerado.
  **Descoberta:** ao ler o `information_schema` do oráculo, o dinheiro é `DOUBLE(8,2)`, não `FLOAT` — ponto flutuante
  com teto escondido de **999.999,99**. RN-CON-011 corrigida (com nota da correção).
- **Nota de harness:** esta sessão do agente roda a partir do repositório de estudos, então os hooks do
  `.claude/settings.json` do sisfin **não disparam para mim**; rodo os sensores (`tsc`, testes, rastreabilidade) manualmente
  a cada task. Numa sessão aberta dentro do sisfin, eles disparam sozinhos.

**Próximo passo:** T02 (sensores de arquitetura) e T04 (ETL).

## Etapa 8 — T02: sensores de arquitetura · 25/09/2026

**Objetivo:** tornar as regras de camadas do design verificáveis por máquina, com mensagens que ensinem o agente.

- `api/.dependency-cruiser.cjs`: `dominio-puro`, `http-so-fala-com-application`, `prisma-so-em-infra`, `sem-ciclos`.
  Cada regra tem um `comment` que diz **o que fazer** (ex.: "Crie/use um repositório em infra/"); a saída `err-long`
  o mostra — a saída padrão `err` não mostrava, e o teste pegou isso.
- Lint de SQL cru (`test/arquitetura.spec.ts`): `$queryRaw`/`$executeRaw` só em `*/infra/**` com `clientId: number`;
  variantes `*Unsafe` proibidas (revisão de segurança #2).
- Aceite: fixture com `domain/` importando o Prisma falha com as duas regras **e** a mensagem de correção.
- Hook pós-edição passou a rodar `tsc` + `depcruise` em `api/`: ~4 s por edição.
- **Bug no sensor dormente:** o typecheck do hook foi escrito antes de `api/` existir e rodava `npx tsc` a partir da raiz,
  onde o TypeScript não está instalado — o `npx` baixava um pacote chamado "tsc" que **não é o compilador** e todo
  arquivo "falhava". Só apareceu ao ativar. Corrigido (`cwd` no projeto + `--no-install`). Lição: sensor que nunca rodou
  não está testado.
- CI: novo job `api` (typecheck, camadas, jest).

## Etapa 9 — T04: migração de dados (ETL) · 25/09/2026

**Objetivo:** o banco novo nasce dos **mesmos dados** do oráculo, para os mesmos casos de paridade rodarem nos dois lados.

- `tools/migrar-dados.mjs` (drivers `mysql2` e `pg` em `tools/package.json`): tabela a tabela na ordem das FKs,
  **preservando ids**, numa transação única (erro → rollback, nada gravado); ajusta as sequences.
  Converte `tinyint` → boolean, `DOUBLE(8,2)` → texto decimal de 2 casas, `SisFinModelsBillPay` → `BillPay`.
- Proteção: só grava em banco local (o ETL faz `TRUNCATE`), salvo `--permitir-remoto`.
- Relatório com **só ids e valores** (revisão #12): contagens, arredondamentos, saldo × extrato, órfãos, usuários sem cliente.
  `--seed` → `docs/relatorios/etl-seed.md` (versionado, dados fictícios); sem flag → `.relatorios/` (fora do git).
- Oráculo **resetado** antes (as sondas tinham deixado dados de teste) → 1.135 linhas em 9 tabelas, contagens iguais,
  0 arredondamentos, 0 divergências saldo × extrato, 0 órfãos.
- Prova dos detectores: rodei a suíte de paridade (que exclui uma conta paga) e o ETL de novo → **1 órfão** detectado.
- Limite honesto: o detector de arredondamento **não foi exercitado** — o seed só tem valores inteiros.
; comparação bcrypt mesmo com e-mail inexistente (tempo igual).
- **Dois bugs pegos pelos testes antes de chegar ao container:**
  1. `jwt.sign(..., { noTimestamp: true })` **apaga o `iat`** do payload — e o nosso próprio `verificarToken` exige `iat`:
     todo token emitido seria recusado.
  2. Controles criados com `useValue: new …` no decorator do módulo são **instâncias únicas no processo**: o estado vazava
     entre aplicações (o teste de rate limit recebeu 429 antes da hora). Trocado por `useFactory`.
- `@nestjs/throttler` trocado por um guard próprio que reproduz o `throttle:60,1` (janela fixa, mesmos cabeçalhos).
- **Aceite:** `node tools/paridade.mjs --base http://localhost:3300 --alvo novo RN-AUT` → ✅ — **primeiro caso de paridade
  passando no sistema novo**, sobre os dados migrados pelo ETL (a senha `secret` do seed funciona com o hash do PHP).
- Limite registrado: lockout, blacklist e rate limit em memória valem por instância (Redis quando escalar).

## Etapa 11 — T07 tenant e T08 leituras compatíveis · 25/09/2026

**Objetivo:** o isolamento entre clientes num único ponto, e as leituras que `contas` e a paridade usam.

- **T07:** `regras-tenant.ts` é uma **função pura** que decide, operação a operação do Prisma, como restringir ao cliente
  (lista fechada de modelos; `findUnique`/`update`/`delete` com *where* único estendido; `clientId` sempre sobrescrito
  em `create` e removido em `update`; `connect` proibido; operação desconhecida ou **sem cliente → erro**). A extensão só aplica.
  `@ComCliente()` = JWT + cliente obrigatório (403) + contexto em `AsyncLocalStorage`.
- **Três armadilhas pegas pelos testes:**
  1. Primeira versão chamava `base[modelo][op]()` dentro da extensão — isso **roda fora da transação interativa**.
     Trocado por `query(args)`; o teste de integração prova que o filtro vale dentro de `$transaction` (a T12 depende disso).
  2. **As promessas do Prisma são preguiçosas**: só executam no `.then`. Com `await` fora do escopo do `AsyncLocalStorage`,
     a extensão não acha o cliente. Criado `ContextoCliente.executarAsync` e um teste que documenta a armadilha.
  3. **O próprio teste quase apagou dados:** com o `beforeAll` falhando, `deleteMany({ where: { id: undefined } })` no
     `afterAll` vira "apague **todas** as categorias" — quem impediu foi a FK. Limpeza agora só com id definido.
- **T08:** `/api/bank_accounts` (+ `/:id`, `/lists`), `/api/category_expenses|revenues` (árvore), `/api/statements`
  (+ `statement_data`) em `compat/`, com repositório em `compat/infra/` sob as mesmas regras.
- **Peça nova de harness — espelho de leitura** (`tools/espelho.mjs`): logo após o ETL os bancos têm os mesmos dados, então
  cada GET deve responder **igual em valores**. Resultado: 11/12 de primeira; a diferença era o link de paginação sem
  `orderBy`/`sortedBy` (o paginador do Laravel preserva a query). Corrigido → **12/12 idênticas**.
- Achado de outro módulo: criar categoria no legado desliga o filtro de tenant — registrado no inventário para `categorias`.
- **O sensor de SQL cru deu falso positivo** (achou `$queryRaw` num *comentário*). Ajustado para ignorar comentários — e
  provado que ainda pega uso real (arquivo de teste com `$queryRaw` fora de `infra/` → falha). No meio do ajuste, uma edição
  feita pelo shell perdeu as barras invertidas da regex e a suíte **deixou de compilar em silêncio**: o sinal foi o total
  de testes cair de 74 para 71. Conferir a contagem de testes, não só "passou", virou hábito.
- **Fase A concluída (T01–T08).**

---

## Lições até aqui

1. **Sondar antes de concluir.** Duas hipóteses minhas estavam erradas (admin sem cliente; dia 31 quebrado) e só a sonda mostrou.
2. **O oráculo tem ambiente.** Versão de ICU mudou o comportamento da busca — fixar a imagem e tratar diferenças de ambiente como dúvida.
3. **Sensores computacionais baratos pagam rápido.** A rastreabilidade pegou erro de formatação; o `oraculo-sql` provou regra de transação que a leitura do PHP só sugeria.
4. **Bug encontrado vira decisão, não correção silenciosa.** Cada comportamento corrigido tem ADR e bloco `divergencias`.
5. **Migração pode deixar o sistema menos seguro que o legado.** Lockout, rate limit e blacklist existiam em 2017 e
   quase ficaram "para depois". Controles de segurança do legado são regras (`RN-AUT-*`), não detalhe de implementação.
6. **Sensor inferencial + conferência humana.** O revisor LLM achou problemas que nenhum sensor computacional pegaria
   (corrida, bypass de tenant); cada afirmação dele sobre o legado foi conferida antes de virar requisito.
7. **Sensor que nunca rodou não está testado.** O typecheck do hook, escrito antes de existir código, estava quebrado.
8. **Compare valores, não só formatos.** Com os dois bancos iguais depois do ETL, o espelho de leitura pega diferenças
   que um teste de contrato (só formato) deixaria passar.
9. **Teste que limpa dados precisa de trava.** Um `where` com `undefined` vira "sem filtro".
