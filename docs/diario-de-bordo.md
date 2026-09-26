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

## Etapa 12 — As duas versões no ar (local) · 25/09/2026

**Objetivo:** pedido do Francisco — "deixar no ar as duas versões". Decisão dele: **local e utilizável** (sem expor na internet).

- **A tela do legado estava quebrada** (`/app` pedia `build/spa.bundle.js`, que nunca foi versionado). `docker/spa/Dockerfile`
  compila o SPA de `legacy/` (Vue 1 + webpack 1.15) com a URL da API fixada no build, como a task `spa-config` do gulp fazia.
  Node **8** em vez do 6.8.1: sem lockfile, dependências transitivas de hoje pedem um pouco mais. Compilou de primeira.
- A **mesma tela** servida duas vezes por nginx: **:8082 → API antiga**, **:8083 → API nova**, com um selo de versão.
  É o Strangler Fig visível: o front não sabe qual backend atende. CORS da API nova liberado para :8083.
- **Testado num navegador de verdade (Playwright):** login e telas nas duas versões.
- **O achado mais importante desta etapa:** a tela nova listava 9 contas em ordem de id, sem banco. O SPA real chama
  `/api/bank_accounts?page=1&orderBy=balance&sortedBy=desc&search=&include=bank&limit=5` — parâmetros que o **contrato escrito
  à mão não tinha** e que o espelho não testava. Capturei o **tráfego real** de todas as telas (`.specs/legado/trafego-spa.md`)
  e o espelho passou a usar essas URLs.
  - `limit` vira `per_page`; `include=bank`/`bankAccount` aninham objetos; busca em contas bancárias é LIKE em 4 campos.
  - A busca por período no extrato **não tem efeito** no legado (o repositório não declara campos pesquisáveis).
  - O link de paginação do Laravel **move o `page` para o fim** da query — meu teste unitário da T08 afirmava o contrário e
    estava errado. Quem manda é o oráculo.
- Resultado: espelho **15/15 idêntico**; na tela nova, contas bancárias, plano de contas e extrato funcionam como na antiga.
- Fora do `contas`: `/api/cash_flows*` e `/api/banks` ainda não existem no novo; logos de banco não carregam em nenhum dos
  dois (falta `storage:link` no container do legado).

## Etapa 13 — Fase B: o módulo `contas` (T09–T14) · 25/09/2026

**Objetivo:** `/api/bill_pays` e `/api/bill_receives` completos, com aceite pela paridade no sistema novo.

- **Contrato antes do código:** capturei no oráculo o formato de `include=category,bankAccount` (categoria com
  `depth: null` e sem `children`) e li o modelo do SPA para saber o que ele envia (ids e valor às vezes em texto).
- **Domínio puro (T09–T11):** vencimentos, tabela de movimentos e busca BR. Dinheiro em **centavos inteiros**. 38 testes.
- **T12:** repositório com `SELECT … FOR UPDATE` (conta primeiro, depois contas bancárias em ordem de id) e serviço que
  grava conta + saldo + extrato numa transação. Integração no Postgres: falha injetada → nada gravado; pagamentos
  simultâneos → um débito. **Teste de mutação:** tirei o `FOR UPDATE` e o teste de concorrência falhou 3/3 (débito em
  dobro) — prova de que o teste testa o que diz testar.
- **Primeira rodada da paridade no sistema novo: 8 de 9 casos falharam.** Causa única: o DTO convertia `value` para texto
  (para não passar por ponto flutuante) e depois `@Min`/`@Max` comparavam **texto com número** → toda conta dava 422.
  Validador próprio sobre o texto → **8/9**.
- O caso que sobrou não era bug: PUT de outro cliente com corpo **incompleto** dá 422 no novo (campos obrigatórios —
  ADR-003) e 404 no legado. Registrado como divergência **e o caso foi reforçado** com um PUT de corpo válido, que dá 404
  nos dois — o isolamento continua provado. → **9/9**.
- Minhas sondas bateram no rate limit da própria API nova (429) — confirmação involuntária de que ele funciona.
- Na tela nova (SPA), **contas a pagar lista as contas** (no legado a lista vem vazia — RN-CON-016) e o dashboard mostra
  "A pagar hoje R$903,00", igual ao legado.
- "Hoje" dos totais ficou em **UTC** como no legado: o design dizia `America/Sao_Paulo`, o que seria correção sem ADR.

## Etapa 14 — Fase C: CI e segurança (T15, T17) · 25/09/2026

- **T17:** 17 testes de segurança transversais (mass assignment, limites de valor, teto de repetição, log sem segredos).
- **T15:** CI com job `sistema` que reproduz o ciclo inteiro — sobe legado e novo, ETL, espelho, paridade nos dois alvos,
  rastreabilidade estrita e testes de integração com banco. Ensaio local na mesma sequência: **tudo verde, 134 testes**.
  A execução real no GitHub acontece no próximo push.
- **T16:** `security-reviewer` rodando sobre o **código** (a primeira revisão foi sobre as specs).
- Tropeço de processo: um script de documentação passado inline pelo shell quebrou nas aspas; passou a ficar num arquivo.

## Etapa 15 — T16: revisão de segurança do código e fechamento (T18) · 25/09/2026

**Objetivo:** passar o código pelo sensor inferencial e só aceitar o módulo com os achados tratados.

- `security-reviewer` sobre `api/src` e `api/test`: os 12 achados das specs **confirmados no código**; 11 novos, nenhum alto.
  Registro: `docs/revisoes/2026-09-25-security-contas-codigo.md`.
- **Regra que segui: hipótese do revisor vira teste que falha antes de eu corrigir.** As três mais sérias se confirmaram:
  1. **Deadlock** — 8 criações pagas simultâneas na mesma conta bancária → `40P01 deadlock detected`. A conta era gravada
     antes do `FOR UPDATE` (o design pedia o contrário): o insert pega lock de FK e o `FOR UPDATE` depois precisa subir o
     lock. Invertida a ordem → 8 débitos, 3/3 execuções. Deadlock/serialização agora respondem 409.
  2. **`/API/access_token` sem rate limit** — o Express não diferencia maiúsculas no caminho; o guard diferenciava.
  3. **10 logins errados em paralelo, nenhum bloqueado** — havia um `await` (bcrypt) entre checar e contar a tentativa.
     Agora a tentativa é reservada antes, no mesmo passo síncrono → 5× 400 + 5× 403.
- Também corrigidos: escrita aninhada proibida por completo; log de erro do Prisma sem argumentos (PII); data inexistente,
  `orderBy=constructor` e busca numérica gigante agora dão 422/ignoram em vez de 500; `iss` fixo e verificado; boot recusa
  segredo de exemplo em produção (e o compose passou para `NODE_ENV=development`, que é o que ele é).
- ETL ganhou checagem de **referências entre clientes** — provada corrompendo um registro de propósito.
- e2e **A × B pelas rotas HTTP** (7 testes), que era o único ponto sem cobertura.
- **Pendências registradas** (não bloqueiam o módulo; bloqueiam produção com escala): FK composta/RLS, Redis para
  lockout/blacklist/rate limit, `trust proxy`.
- Ciclo completo do CI ensaiado localmente: harness 5/5, rastreabilidade estrita, ETL, espelho 15/15, paridade 9/9 nos
  dois alvos, camadas limpas, **157 testes**.

**Módulo `contas` concluído (T01–T18).** Próximo: primeira execução real do CI no push; depois, escolher o próximo
módulo (fluxo de caixa é o mais visível na tela — é o único gráfico do dashboard que ainda não carrega).

## Etapa 16 — Módulo `fluxo-de-caixa`: levantamento e proposta · 25/09/2026

**Objetivo:** o próximo módulo — é o único bloco do dashboard que não carrega na versão nova.

- **Arqueologia** em `CashFlowsController` e `CashFlowRepositoryTrait`, e **SQL observado** com `oraculo-sql`. Achados:
  - **A janela de `/api/cash_flows` é fixa no código: fev–dez/2018** (`new Carbon('2018-02-01')`). A tela de fluxo de caixa
    do legado aparece **sempre vazia** com dados atuais. A tela calcula o "primeiro mês" como o mês anterior a hoje — ou
    seja, espera a janela a partir do mês atual; a data fixa foi um atalho da época do TCC.
  - O **"primeiro mês"** (realizado) passa a mesma data como início e fim → só entram contas pagas que vencem **no último
    dia** do mês. Provado: recebidas nos dias 15 (10) e 31 (5) → o legado mostra **5**.
  - O corte do saldo anterior é `created_at <= 'aaaa-mm-dd'` → exclui o que foi lançado durante o último dia.
  - O filtro de cliente só vale na categoria raiz; filhas e contas não são filtradas. **Não há vazamento no seed** (0 raízes
    com filhas de outro cliente), mas o isolamento depende da integridade da árvore — e a criação de categoria no legado
    desliga o tenant.
- **Hipótese minha que caiu:** achei que "voltar 2 meses" para o saldo anterior fosse bug. Não é: o saldo é *antes do
  primeiro mês*, que já é o mês anterior ao início.
- **Paridade apesar da janela fixa:** o legado ignora parâmetros, então os casos criam dados **na janela de 2018** e o
  sistema novo será comparado nela via `?start=2018-02` (parâmetro novo, proposto no ADR-006).
- **O executor de paridade ganhou datas relativas** (`hoje`, `daqui_N_dias`, `mes_atual`, `mes_anterior`, em UTC) e
  `salvar` com caminho vazio (corpo inteiro). Dois cuidados de estabilidade: a checagem "fora da janela" virou uma
  afirmação sobre a janela inteira, e o caso da janela padrão deixou de depender da ordem de execução dos casos
  (num oráculo zerado, como no CI, ele roda antes do caso de 2018).
- 3 casos (`RN-FLX-001`, `002`, `003-a-007`) estáveis no legado; divergências do ADR-006 registradas → `--alvo novo`
  contra o legado falha exatamente nos 2 casos corrigidos.
- TO-BE em rascunho: REQ-FLX-01..07, **ADR-006 (proposto)**, design (SQL agregado com `client_id` nas três tabelas, janela
  pura, montagem pura), tasks F01–F07.

**Próximo passo:** Francisco decide as DUV-FLX-001..004 (ADR-006) e aprova o plano com
`node tools/aprovar-tasks.mjs fluxo-de-caixa "Francisco"`.

## Etapa 17 — Módulo `fluxo-de-caixa`: implementação (F01–F07) · 25/09/2026

- **Aprovação:** `node tools/aprovar-tasks.mjs fluxo-de-caixa "Francisco"` → hash `e486869c0978`; ADR-006 aceito.
- **Achado ao portar a montagem (RN-FLX-008):** o legado deduplica categorias **pelo nome**. Sonda: duas categorias
  homônimas com 100 e 200 → a tabela mostra só uma, o total do mês mostra 300. Implementado **fiel** (o design dizia
  "porte fiel") e levado à decisão (DUV-FLX-005) em vez de corrigido em silêncio.
- **F01–F03:** janelas e montagem puras (21 testes); SQL agregado com `client_id` na raiz, nas filhas e nas contas.
  Integração: árvore corrompida não vaza — e o próprio SQL do legado, rodado no mesmo banco, **vaza os 777,77** (controle).
- **F04:** paridade **3/3 de primeira**. Verificação mais dura: resposta inteira legado × novo logo após o ETL.
  - A primeira comparação mostrou diferenças que **eu mesmo causei**: a rodada de paridade tinha criado contas no banco novo.
    Comparação só vale logo depois do ETL.
  - Na categoria homônima, **nenhum dos dois bancos** garantia qual aparecia (empate no `ORDER BY`). Desempate por `id`.
  - Resultado final, 3/3 execuções: **só o "primeiro mês" difere** — exatamente a correção do ADR-006.
- Tropeço: um comentário SQL (`--`) depois da crase do template virou código TypeScript; o typecheck pegou e o
  `docker compose up --build` seguiu com a imagem anterior — sem olhar o build, eu teria testado código velho.
- **F05:** espelho 17/17; **a tela de fluxo de caixa e o gráfico do dashboard funcionam na versão nova**. Na antiga, a
  tela mistura a coluna 08/2026 (calculada pelo front) com dados de 2018 (fixos no servidor).
- **F06:** revisão de segurança — 9 achados, nenhum alto. O mais importante: **meus testes não provavam cada filtro
  sozinho**. Com casos novos e **mutação** (sem `b.client_id`, os dois falham), o isolamento ficou provado. Extrato
  apontando para conta bancária de outro cliente **vazava 999,99** no saldo — teste falhou, corrigido. Também: e2e das
  rotas, ano do `start` limitado, centavos com `BigInt`, índice do saldo (`EXPLAIN`: index only scan). Uma hipótese
  do revisor não se aplicou (`?start[x]` não vira objeto no Express 5) — o teste afirma o comportamento real.
- **Ciclo completo** (espelho, paridade nos dois alvos, integração): verde.

## Etapa 18 — Módulos `categorias` e `contas-bancarias` (escrita): levantamento e proposta · 25/09/2026

**Objetivo:** a escrita de categorias e de contas bancárias, junto com `GET /api/banks`. São as telas que ainda não
salvam na versão nova (plano de contas, criar/editar conta bancária).

- **Arqueologia** em `CategoryRepositoryTrait`, `AbstractCategory`, `CategoryRequest`, `BankAccountCreateRequest`,
  `BankAccountSetDefaultListener`, no `NodeTrait` do nestedset (dentro do container) e nos componentes Vue. Sondas no
  oráculo com dois clientes.
- **🔴 Vulnerabilidade (RN-CAT-003):** o cliente B faz `PUT` numa categoria do cliente A e recebe **404**, mas a escrita
  **acontece**:
  - com `parent_id` de B, a categoria é movida para a árvore de B;
  - o `update` desliga o tenant, e o 404 vem do `find` que o controller faz depois, já com o tenant religado;
  - cadeia completa provada: A lança uma conta de 4242 na categoria movida e ela aparece no **fluxo de caixa de B**.
  - Era a suspeita anotada no inventário desde a Etapa 1 ("desliga o tenant... investigar"). Estava na **edição**, não
    na criação: a criação é protegida pela validação do `parent_id`.
- **🔴 Corrupção (RN-CAT-009):** excluir uma raiz cuja filha tem contas responde 500, mas a raiz **já foi apagada**:
  - o nestedset apaga o nó e só depois as descendentes, sem transação;
  - as filhas ficam órfãs, somem da tela e as contas ficam ligadas a categorias invisíveis;
  - confirmado direto no MySQL.
- **Contrato real da tela:**
  - A edição de conta bancária reenvia **o objeto inteiro do GET** (`id`, `balance`, datas, `bank`). Com a whitelist
    global do sistema novo, a tela quebraria com 422, e rejeitar `balance` (ideia inicial) também quebraria.
  - A tela de categorias manda `id` no corpo.
  - Nos dois casos o novo vai aceitar e ignorar **exatamente** esses campos, cada um com seu caso de paridade.
- **Bug no que já estava migrado (RN-CAT-011):**
  - O legado lista a árvore em **ordem de id**, sem `ORDER BY`: o `EXPLAIN` mostra o índice `client_id`, e o InnoDB
    devolve na ordem da PK.
  - O compat ordena por `_lft`. Com as árvores do seed as duas ordens coincidem; depois das sondas (categorias
    movidas), **o espelho acusou** `/api/category_revenues`.
  - Fica como G01 no plano. O conserto espera a aprovação, porque mexe em código já aprovado.
- **O ETL ganhou três checagens** que bloqueiam o cutover:
  - árvores de categoria entre clientes (por `parent_id` e por `_lft/_rgt`);
  - categorias órfãs;
  - cliente com mais de uma conta padrão.
  - As duas primeiras já acusam os estragos que as próprias sondas fizeram no oráculo local.
- **Paridade:** 10 casos novos (6 de categorias, 4 de contas bancárias; o `RN-CBA-007` também cobre o `GET` de uma categoria), todos verdes no
  legado. Rodado com `--alvo novo` contra o próprio legado, o executor falha **exatamente** nos 4 casos corrigidos pelo
  ADR-007 (sensor de que as divergências estão bem escritas).
- **Decisão de desenho que o dado mudou:** o nested set do legado é numerado **globalmente**, com faixas de clientes
  intercaladas. Manter isso faria toda escrita deslocar linhas de outros clientes. Proposta: renumerar **só o
  cliente**, a partir de `parent_id`, depois de cada escrita. É seguro porque o único uso de `_lft/_rgt` (fluxo de
  caixa) já compara `client_id` (conferido no código).
- TO-BE em rascunho:
  - requirements REQ-CAT-01..08 e REQ-CBA-01..08;
  - **ADR-007 (proposto)**: IDOR, ciclo, exclusão tudo ou nada, 4×500→422, troca da padrão atômica, `ASSETS_URL`;
  - designs;
  - tasks G01–G07 e B01–B07.
- Rastreabilidade `--strict` verde; paridade 22/22 no legado.

**Próximo passo:** Francisco decide as DUV-CAT-001..003 e DUV-CBA-001, 003 e 005 (ADR-007) e aprova os dois planos:
`node tools/aprovar-tasks.mjs categorias "Francisco"` e `node tools/aprovar-tasks.mjs contas-bancarias "Francisco"`.

## Etapa 19 — `categorias` e `contas-bancarias`: implementação (G01–G07, B01–B07) · 25/09/2026

**Aprovação:** Francisco aprovou os dois planos (hashes `baf1b8d63868` e `547b3519e39d`), aceitando o ADR-007.

- **Oráculo limpo sem recriar o banco:**
  - Recriar o volume do legado foi bloqueado pelas permissões.
  - Em vez disso, criei `tools/reparar-oraculo.mjs`: o **dono** de cada categoria órfã ou "invadida" faz `PUT` sem
    `parent_id` e ela volta a ser raiz (RN-CAT-007). Tudo pela API, como um usuário faria.
  - É necessário porque os casos RN-CAT-003 e RN-CAT-009 corrompem o oráculo de propósito a cada rodada.
  - Um derivado de caso (`filhas_visiveis_na_arvore`) dependia de resíduo de rodadas anteriores. Passou a olhar só a
    execução atual.
- **G01:** o espelho acusou 2 rotas de categorias; com o compat ordenando por `id`, voltou a 0.
- **G02/G03:**
  - Nested set **renumerado por cliente**, a partir de `parent_id`, numa transação com advisory lock `(árvore, cliente)`.
  - 7 testes de integração, entre eles: nenhuma linha de outro cliente muda, 10 escritas concorrentes, fluxo de caixa
    seguindo a categoria movida e árvore corrompida → rollback.
  - **Mutação:** sem o lock, a árvore quebra.
  - Um teste do fluxo (F03) comparava profundidade por `_lft/_rgt` **global**. Passou a medir por cliente, como
    previsto no ADR-007.
- **G04 e B05:** **paridade 6/6 e 4/4 de primeira**; 22/22 no total, nos dois alvos.
- **B01, achado:** a tela de edição de conta bancária chama `GET /api/bank_accounts/{id}?include=bank`, e o compat
  ignorava o `include`. A tela quebraria antes de salvar, e nenhum caso de paridade pegava isso. Corrigido; o espelho
  ganhou essa URL e `/api/banks` (20 rotas).
- **B02:** o índice único **parcial** (uma padrão por cliente) exigiu migration manual. `prisma migrate diff` sem drift.
- **B04:** além do lock das linhas, a troca da padrão ganhou um advisory lock por cliente. Sem padrão atual, não há
  linha para travar. A mutação prova: sem ele, 6 criações simultâneas falham em 4 de 4. Na primeira versão, o teste
  só matava a mutação em 2 de 3 rodadas, porque dependia de o cliente já ter uma padrão. Zerar antes o tornou
  determinístico.
- **Telas (G05/B06), Playwright em :8083:**
  - Plano de contas: criar, criar filha, promover e excluir funcionam. O tráfego real confirmou duas previsões do AS-IS:
    `{"id":0,…}` ao criar e `PUT` sem `parent_id` para promover.
  - Um fato novo: o select manda `parent_id` **em texto** (`"167"`).
  - Conta bancária: criar e editar funcionam. O `PUT` real levou o objeto inteiro do GET, como previsto na RN-CBA-009.
- **Flakiness:** em paralelo, uma suíte lia o fluxo de caixa enquanto outra lançava contas no mesmo mês. A CI passou a
  rodar o jest **em série** (`--runInBand`).
- **Revisão de segurança (G06/B07):** 0 altos, 11 achados.
  - **S1:** 30 mil categorias travavam o event loop por **7–10 s** (O(n²)). Agora é linear.
  - **S2:** fila de lock sem limite. Agora 409 em 3 s.
  - **S5:** o revisor atribuiu ao DTO, mas era o `ValidationPipe` do Nest, recursivo, em **toda** rota com corpo,
    inclusive o login.
  - **S11 (novo, achado ao testar o S5):** corpo maior que 100 KB virava 500 no nosso filtro de exceções.
  - **S6:** medi o legado antes de propor limite. Ele serve **169 níveis** de categorias e quebra a árvore inteira no
    170º. O novo aguenta mais de 1.000, então o limite virou DUV-CAT-007.
  - Cada achado teve teste vermelho antes da correção.
- **Ciclo completo:** 268 testes (22 suítes), arquitetura sem violações, rastreabilidade strict, espelho **20/20**,
  paridade **22/22** no legado e no novo.

**Pendências:** DUV-CAT-004 (órfãs no cutover), DUV-CAT-007 (limite de profundidade), DUV-FLX-005; links de paginação
pela config (S10); o 1º CI real no push.

## Etapa 20 — Módulo `extrato`: levantamento e proposta · 25/09/2026

**Objetivo:** Francisco perguntou o que ainda falta migrar.

- **Inventário das rotas:**
  - toda a API usada pelo SPA já responde no sistema novo;
  - sobram o site em Blade (cadastro, login de sessão, convite), o admin de bancos, as assinaturas (Iugu) com o
    webhook, e uma rota pública de teste que dispara e-mail.
- **Ordem recomendada e escolhida:** extrato → cadastro/login → admin de bancos → assinaturas.
- **Arqueologia do extrato** (código, `StatementList.vue`, sondas lado a lado legado × novo logo após o ETL, `laravel.log`):
  - **A tela promete o mês e mostra tudo.** O campo de busca abre com `01/MM/AAAA - 30/MM/AAAA`, mas o repositório
    não declara campos pesquisáveis: lista e totais trazem todos os lançamentos (RN-EXT-003).
  - **Metade dos cabeçalhos quebra.** Data → 500 (`date` não é coluna). Conta → 500, e o motivo não é o join: ele
    funciona na lista, mas o mesmo critério entra na consulta dos totais e o `COUNT(id)` fica ambíguo (RN-EXT-005).
  - **`?limit` é ignorado** no extrato (15 fixo). O compat do novo o respeitava: uma divergência que ninguém tinha
    visto, porque o SPA não manda `limit` nessa tela.
  - O resto do compat (T08) já era fiel: campos, data = dia do lançamento, totais do conjunto e isolamento.
- **Paridade:** 2 casos (lançamento, totais, busca e limit; ordenação), estáveis no legado. Contra o novo atual falham
  só no `limit` e nos 3 status de ordenação.
- **TO-BE em rascunho:**
  - REQ-EXT-01..06;
  - **ADR-008 (proposto)**: o período filtra lista e totais; Data e Conta passam a ordenar;
  - design: módulo próprio, `interpretarBusca` para `shared/`;
  - tasks E01–E05.
- **Um cuidado para o espelho:** a URL real da tela tem um período **fixo** (`01/09/2026 - 30/09/2026`). Com a
  correção ela diverge por decisão, e já dependia da data de hoje. Sai do espelho na E04.

**Próximo passo:** Francisco decide as DUV-EXT-001 e 002 (ADR-008) e aprova com `node tools/aprovar-tasks.mjs extrato "Francisco"`.

## Etapa 21 — Módulo `extrato`: implementação (E01–E05) · 25/09/2026

**Aprovação:** Francisco aprovou o plano (hash `fa8f9227d732`), aceitando o ADR-008.

- **E01:**
  - O design mandava levar o `interpretarBusca` inteiro para `shared/`, mas ele depende do teto monetário de `contas`,
    e `shared` passaria a depender de um módulo. Foi só o **parser de período**, com a regex idêntica (conferida no
    diff), e a suíte de `contas` continuou verde.
  - Domínio do extrato: allowlist de ordenação (com `date` e a chave de join da tela) e período → intervalo UTC
    `[início, dia seguinte ao fim)`.
- **E02:**
  - Lista, contagem e totais com o **mesmo `where`**, sem ordenação nos totais: era isso que quebrava o legado.
  - Os testes comparam a ordem da API com a ordem que o próprio Postgres dá.
  - Defesa em profundidade na conta bancária do lançamento. **Mutação:** sem ela, um lançamento com conta de outro
    cliente aparecia e somava.
- **Um falso alarme que ensinou algo:** o teste do órfão acusou "204 × 205" e parecia status HTTP. Era a
  **contagem**: no sistema novo, excluir conta paga **estorna** (ADR-003), então nasce um lançamento a mais. O teste
  passou a afirmar isso: o original continua e o estorno anula o valor.
- **E03/E04:**
  - **paridade 2/2**; 24/24 no total, nos dois alvos; espelho 20/20;
  - a URL de período fixo saiu do espelho;
  - na tela nova, o extrato abre no mês e **ordena por Conta e por Data**, que davam 500 no legado.
- **E05 — revisão de segurança:** 0 altos/médios.
  - **X1:** `31/12/9999` + 1 dia = ano 10000 → 500. Teste vermelho, depois corrigido limitando o fim.
  - **X2** (ano 0000) não se confirmou; o teste fica como sensor.
- **Marco: toda a API do legado está no sistema novo**, exceto o webhook da Iugu. O que sobra é o site em Blade
  (cadastro/login/convite), o admin de bancos e as assinaturas.

## Etapa 22 — Módulo `site` (cadastro e login): levantamento e proposta · 25/09/2026

**Objetivo:** migrar o site em Blade. Francisco escolheu **endpoints na API nova + telas novas**, em vez de reproduzir
páginas no servidor. Como o SPA é compilado de `legacy/`, que não se edita, as telas do site são o **início do front
Vue 3**.

- **Sondas de um site com sessão e CSRF.** A paridade do harness é JSON, e aqui o contrato é HTML. Escrevi sondas que
  agem como navegador: leem o formulário, guardam cookies e postam com o `_token`. Ficaram em `tools/sondas/`, para
  serem reproduzíveis.
  - **Tropeço:** o 1º cadastro "deu 500". Era a minha sonda, que não achava o `_token` (o `Form::open` põe
    `type="hidden"` entre `name` e `value`). No Laravel 5.3, CSRF inválido vira 500, e não 419.
  - As mensagens de erro não estão no texto da página: estão no atributo `data-error`, que o Materialize exibe via CSS.
- **Achados:**
  - **O "convite" nunca funcionou:** todo POST dá 500. `SubscriptionsController` usa `UserRegisterRequest` sem `use` e
    nem recebe os repositórios. E, se funcionasse, criaria um cliente novo em vez de convidar para o cliente de quem
    convida.
  - **A assinatura nunca foi exigida:** o middleware `check-subscription` está registrado e não é aplicado a nenhuma
    rota. Quem se cadastra usa a API inteira.
  - **JWT na URL:** o menu do SPA abre `/my-financial?token=<JWT>`, e um middleware transforma esse token em sessão
    web.
  - O cadastro grava cliente e usuário **fora de transação**; `client.email` não é validado como e-mail.
  - O login do site tem throttle de 5 tentativas / 60 s (bloqueia até a senha certa). O novo já tem lockout
    equivalente na API (RN-AUT-*).
- **Paridade:** "n/a" em todas as regras, porque o contrato muda de HTML para API (ADR-009). Cada regra aponta a task
  que a cobre; o aceite é por integração com **as mesmas mensagens** capturadas pelas sondas, mais Playwright.
- **TO-BE em rascunho:**
  - REQ-SIT-01..07;
  - **ADR-009 (proposto)**: `POST /api/register` atômico; login e logout pela API existente, sem sessão; telas Vue 3 na
    mesma origem do SPA, com o token na chave que o SPA lê; convite não migrado; token fora da URL; depois do cadastro
    → `/app`;
  - design;
  - tasks S01–S06.

**Próximo passo:** Francisco decide as DUV-SIT-001..004 (ADR-009) e aprova com
`node tools/aprovar-tasks.mjs site "Francisco"`.

## Etapa 23 — Módulo `site`: implementação (S01–S06) · 25/09/2026

**Aprovação:** Francisco aprovou o plano (hash `af43e2de4789`), aceitando o ADR-009.

- **S01/S02 — cadastro pela API:**
  - `POST /api/register` com as mensagens exatas que as sondas capturaram;
  - cliente + usuário numa transação;
  - o mesmo JWT do login.
  - **Achado ao implementar (RN-SIT-009):** o MySQL do legado não diferencia maiúsculas (`utf8_unicode_ci`), então o
    login do legado aceita `CLIENTE1@USER.COM`, e o do sistema **novo recusava**. Era uma regressão no `auth-compat`,
    migrado lá na T09 e nunca notada. Nova sonda reproduzível, correção e índice único `lower(email)`. **Mutação:** sem
    o índice, dois cadastros simultâneos com capitalização diferente passavam os dois.
- **S04 — nasce o `web/` (Vue 3 + Vite + TS):**
  - telas de início, login, cadastro e "minha conta", servidas pelo **mesmo nginx e na mesma origem** do app antigo;
  - o token vai para `localStorage['token']` e o usuário para `localStorage['user']`, exatamente as chaves do app;
  - quem se cadastra cai no dashboard do app antigo, já logado, com o nome no menu.
- **Quando a ferramenta falha no meio do caminho:**
  - O Playwright MCP (Chrome com perfil persistente) parou de receber cliques e teclado depois do 1º cadastro: um
    diálogo nativo do gerenciador de senhas prende a entrada. Em vez de pedir ajuda manual, virou **E2E versionado**
    (`web/e2e/`, `@playwright/test`, Chrome instalado, headless, perfil limpo), que roda local e na CI.
  - No caminho, o `@playwright/test` 1.52 **travava** ao carregar a config num pacote ESM com Node 24 (até o
    `--list`). Isolei com uma config mínima e resolvi com o 1.63.
  - Depois de um `compose up --build`, o 1º teste pegava a API subindo. O E2E ganhou um `globalSetup` que espera o
    `/health`.
- **S05 — token fora da URL:**
  - o app antigo continua abrindo `/my-financial?token=…`; a tela nova apaga o parâmetro antes do roteador;
  - o log do nginx registra a rota sem a query;
  - tropeço: com `$uri`, o log mostrava `/web/index.html`, porque o `try_files` troca o `$uri`.
- **S06 — revisão de segurança: 1 falha ALTA que EU introduzi na S02.**
  - Para igualar maiúsculas, usei `mode: 'insensitive'` do Prisma, que vira **ILIKE sem escapar `%`**. O teste da
    hipótese do revisor confirmou: login com o e-mail `%` e a senha do seed → **200 com o token do usuário 1**.
  - Estava só local, antes do commit. Correção: `lower(email) = lower($1)`, mais um **sensor** que varre o código
    contra a volta do padrão.
  - Também corrigidos, cada um com teste vermelho antes:
    - mapas em memória que só cresciam;
    - limite próprio do cadastro (5 por IP por hora);
    - CSP estrita, `X-Frame-Options` e `nosniff` no nginx (o E2E roda com a CSP ativa);
    - NUL no login;
    - log sem query no servidor inteiro.
- **Mais dois sensores ajustados no fechamento:**
  - **SQL cru:** o sensor de arquitetura barrou as consultas `lower(email)` (fora do padrão "infra + clientId"). Em
    vez de desligá-lo, ganhou uma exceção **verificável**: só dois arquivos, e só se todo SQL cru deles tocar apenas
    `users`. Mutação: com `clients` na consulta, volta a acusar.
  - **Espelho:** acusou 3 rotas do extrato com `8948.720000000001` × `8948.72`. É ruído de `DOUBLE` do legado
    (RN-CON-011), que apareceu quando a paridade lançou centavos no oráculo. O espelho passou a comparar dinheiro em
    centavos (ADR-003), absorvendo só o ruído (< 1e-6).
- **Ciclo completo:** API 335 testes; web 12 unitários + 7 E2E; espelho 20/20; paridade 24/24 nos dois alvos.

**Pendências:**
- CSP do `/app` (o Vue 1 usa `eval`);
- `trust proxy` na implantação;
- confirmação de e-mail (produto);
- DUV-CAT-004/007 e DUV-FLX-005;
- módulos restantes: admin de bancos e assinaturas.

## Etapa 24 — Módulo `admin-bancos`: levantamento e proposta · 26/09/2026

**Objetivo:** o admin de bancos (Blade, sessão, gate `access-admin`). Sondas de navegador como as do site
(`tools/sondas/admin-bancos-legado.mjs` e `admin-auth-legado.mjs`, com upload multipart).

- **1ª rodada: tudo 500.** Antes de concluir, fui ao log: "View [admin.banks.index] not found". O diretório versionado
  é `views/Admin` (A maiúsculo) e o código pede `admin.`. No Windows/macOS do autor funciona; **em Linux, o admin
  inteiro dá 500** (RN-ADB-001). Isso é fato do legado.
  - Para sondar a regra **pretendida**, a imagem do oráculo ganhou o link `views/admin → Admin`, que emula o ambiente
    do autor sem tocar em `legacy/`. Está documentado no Dockerfile e na regra.
- **Achados, já com o link:**
  - **Criar e editar banco nunca funcionaram:** `BankCreateRequest` e `BankUpdateRequest` **não existem**. Os bancos
    vêm só do seeder. Se funcionasse, editar um banco com o logo padrão sobrescreveria o `default.jpg` de todos.
  - Excluir: sem uso → apagado; em uso → 500 (FK).
  - **`/admin/register` é público** e cria usuários sem cliente (`Auth::routes()` dentro do prefixo `/admin`).
  - **Recuperação de senha:** o e-mail sai, mas o link vai sem `/admin` → **404**. Só funciona se a pessoa corrigir a
    URL à mão.
- **Tropeços da sonda (registrados para não repetir):**
  - token CSRF procurado numa página sem formulário (a listagem exclui por componente Vue);
  - a página de recuperação é só para visitante, então a sonda logada não achava formulário;
  - bancos de teste que a sonda deixou no oráculo foram removidos **pela rota de exclusão do próprio admin**.
- **Paridade antiga ficou frágil:** o RN-CBA-001 falhou 1 vez em 3 no legado. Não era regressão: o cliente 1 do
  oráculo acumulou **110** contas bancárias ao longo das rodadas, e o caso procurava a conta recém-criada numa lista
  de `limit=100` em ordem crescente. Passou a ordenar por id decrescente. Os outros casos usam a conta mais antiga,
  que é estável.
- **TO-BE em rascunho:**
  - REQ-ADB-01..07;
  - **ADR-010 (proposto)**: API `/api/admin/banks` só para admin; criar e editar **pela primeira vez**, com upload
    validado pelo conteúdo (PNG/JPEG/WebP, 1 MB), nome aleatório, nunca sobrescrever; logos num volume servido pelo
    nginx da `:8083` no mesmo caminho do legado, com imagem padrão; excluir em uso → 422; cadastro público do admin e
    recuperação quebrada **não migrados**;
  - design;
  - tasks A01–A06.

**Próximo passo:** Francisco decide as DUV-ADB-001..006 (ADR-010) e aprova com
`node tools/aprovar-tasks.mjs admin-bancos "Francisco"`.

## Etapa 25 — Módulo `admin-bancos`: implementação (A01–A06) · 26/09/2026

**Aprovação:** Francisco aprovou o plano (hash `bb0f9a303b2e`), aceitando o ADR-010 e as DUV-ADB-001..006.

- **A01–A03 — API `/api/admin/banks`, só admin:**
  - 401 sem token; 403 para cliente **antes** de o upload ser lido (os guards rodam antes do interceptor);
  - o logo é decidido pela **assinatura dos bytes**, não pela extensão nem pelo Content-Type; SVG recusado;
  - ordem arquivo novo → banco → remoção do antigo; se o banco falha, o arquivo novo sai; o `default.jpg` e o logo que
    outro banco usa nunca são removidos;
  - a linha do banco é travada na edição e na exclusão; "em uso" é global (conta de qualquer cliente), por isso vai em
    SQL cru. O sensor de arquitetura acusou, e a exceção "só `users`" virou um mapa **por arquivo e por tabela**.
    Mutação: com `bill_pays` na consulta, volta a acusar.
  - Mutações nos testes de integração: sem a limpeza do novo, sem a checagem de compartilhado, sem a remoção do antigo
    e com o guard deixando passar, cada uma derruba teste. As duas que a integração não pegou (tamanho e nome
    removível) o unitário do domínio pega.
- **A04 — servir e migrar:**
  - volume `arquivos`: API em leitura e escrita, nginx em só leitura; `ASSETS_URL` na `:8083`; ausente → imagem padrão;
  - a API passou a rodar como `node` (não root), e o volume nasce com esse dono;
  - `curl` de aceite: um PNG enviado como `x.html`/`text/html` foi gravado `.png` e servido `image/png`;
  - `tools/migrar-logos.mjs`: no seed, relata os 3 logos que nunca existiram (RN-ADB-007);
  - o espelho normaliza a origem nova dos logos: 20/20 logo após o ETL.
- **A05 — telas no `web/`:** lista, novo, editar, excluir; link em "Minha conta" só para admin. A tela de edição
  precisava de `GET /api/admin/banks/:id`, que o design não previa: entrou com testes e está nas mudanças após a
  aprovação do design (o `tasks.md` aprovado não muda). E2E com um PNG **decodificável** (o fixture de 16 bytes da
  API só tem a assinatura).
- **A06 — revisão de segurança** (`docs/revisoes/2026-09-26-security-admin-bancos.md`):
  - **S1 (média):** o nome do banco vira HTML **sem escape** no autocomplete do app antigo (Vue 1, sem CSP, mesma origem
    do token). `legacy/` não se edita; a barreira ficou na única porta de escrita: o nome recusa `< > " '`.
  - **S2:** o `migrar-logos` copiava qualquer conteúdo e seguia link simbólico; agora confere extensão e assinatura e
    copia o conteúdo lido. O teste do link é pulado no Windows e foi conferido num contêiner Linux, com mutação.
  - **S3:** dois bancos com o mesmo arquivo trocando ao mesmo tempo deixavam o arquivo órfão (o teste reproduziu).
    Trava consultiva por nome de arquivo.
  - **S4:** o erro do multer ecoava o nome do campo; agora é mensagem fixa.
  - **Tropeço:** o 1º vermelho de S3 e S4 foi **429**, não a falha: a suíte passou de 60 requisições por minuto. Com o
    limite folgado só nessa suíte, refiz a prova por mutação e as três correções mordem sem 429 nenhum.
- **Fechamento, e dois sensores que envelheceram:**
  - A paridade no legado falhou com `-15.000000000000028` × `-15`: a subtração em JS de saldos grandes do oráculo.
    Os deltas passaram a ser comparados em centavos, a mesma regra do espelho (ADR-003).
  - O RN-CAT-001 falha **nos dois alvos** igualmente. Conferi no MySQL: a sequência de receitas passou a de despesas, e
    a despesa que o caso cria (379) tem o mesmo id de uma receita do mesmo cliente, então "pai de outra árvore" vira
    pai válido. Não é regressão (na CI o oráculo nasce limpo). Fica como pendência, com o diagnóstico.
- **Números:** API 389 testes (+54); web 24 unitários + 11 E2E; espelho 20/20; paridade 23/24 nos dois alvos (o
  RN-CAT-001 acima).

**Pendências:**
- ETL relatar nomes de banco com `< > " '` (a barreira do S1 vale para o que entra pela API);
- varredura de arquivos órfãos no volume (queda entre gravar o arquivo e o commit);
- RN-CAT-001 independente do acúmulo do oráculo;
- CSP do `/app`, `trust proxy`, confirmação de e-mail; DUV-CAT-004/007 e DUV-FLX-005;
- módulo restante: assinaturas (Iugu) — decidir entre sandbox da Iugu e simulador.

## Etapa 26 — Módulo `assinaturas`: levantamento e proposta (Stripe no lugar da Iugu) · 26/09/2026

**Decisão de Francisco:** trocar a Iugu pelo **Stripe** (conversa antes do levantamento: Stripe × Asaas × Mercado Pago
× simulador; o Stripe venceu pelo modo de teste sem burocracia e pelo Stripe CLI, que leva webhooks ao `localhost`).

- **O oráculo não tem conta na Iugu** (`IUGU_API_KEY` vazia): criar assinatura e os webhooks que consultam a Iugu dão
  500. Antes de registrar, o `laravel.log` confirmou a causa (`IuguAuthenticationException`), como na lição 25. O
  caminho feliz saiu do código, e cada regra diz se veio da sonda ou do código
  (`tools/sondas/assinaturas-legado.mjs`).
- **Achados — a cobrança nunca operou:**
  - o front tem o **modo de teste da Iugu fixo**, um id de conta de exemplo e um cartão de teste pré-preenchido;
  - o gate `check-subscription` não está em nenhuma rota (já visto no site, RN-SIT-003): ninguém paga para usar;
  - o **webhook é público** e marca como paga uma fatura pelo id **sem conferir** o status devolvido pela Iugu — o
    cliente vê o id na URL do próprio boleto;
  - criar assinatura não é transação e **permite assinar duas vezes**; a assinatura é do usuário, mas o gate procura
    pelo cliente;
  - cancelar existe no código e nada o chama; uma rota pública de teste dispara o e-mail de "assinatura ativa".
- **TO-BE em rascunho:**
  - REQ-ASS-01..07;
  - **ADR-011 (proposto):** porta `GatewayDePagamento` com adaptadores **Stripe** e **simulador** (testes, CI e E2E sem
    internet nem chave); **Stripe Checkout** e **portal do cliente** hospedados (o cartão nunca passa por nós); só
    cartão nesta etapa; uma assinatura viva por **cliente**; webhook com **assinatura verificada** e idempotência;
    gate com os corpos do legado, **desligado por padrão** (ligar derruba todos os clientes de hoje); nenhuma chave no
    repositório público;
  - design e tasks P01–P07 (a P07 é o roteiro com o Stripe real, usando as chaves de teste do Francisco).
- SDK conferido no npm antes de entrar no design: `stripe` 22.6.2.

**Próximo passo:** Francisco decide as DUV-ASS-002..010 (ADR-011) e aprova com
`node tools/aprovar-tasks.mjs assinaturas "Francisco"`.

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
10. **O contrato é o tráfego real, não o que se escreveu sobre ele.** O front usava parâmetros que nenhum documento
    mencionava; só apareceram ao pôr a tela de verdade na frente da API nova.
11. **Teste de mutação valida o teste.** Um teste de concorrência verde não prova nada até falhar sem o lock.
12. **Divergência que aparece no fim vira ADR + caso reforçado**, nunca ajuste do "esperado".
15. **Teste de isolamento precisa isolar.** Com dois filtros no caminho, cada um tem de ser provado sozinho — mutação faz isso.
16. **Compare logo depois do ETL.** Qualquer execução entre os dois (inclusive a paridade) muda um dos lados.
14. **Oráculo com bug de janela ainda serve de oráculo:** crie os dados onde ele olha (2018) e compare o novo lá.
13. **Hipótese de revisor vira teste que falha antes da correção.** Três de três se confirmaram — e o teste fica como sensor.
17. **"Responde 404" não é "não fez nada".** Teste de isolamento de escrita tem de conferir o **efeito** (ler como a
    vítima depois do ataque), não só o status do atacante.
18. **O corpo que a tela envia faz parte do contrato.** Uma whitelist correta em teoria quebraria a edição de conta
    bancária; só a leitura do componente Vue mostrou o objeto inteiro indo no `PUT`.
19. **O revisor pode acertar o sintoma e errar a causa.** O teste do S5 continuou vermelho depois da correção proposta
    (no DTO); a pilha do erro mostrou que o problema era do framework e valia para toda rota — inclusive o login.
20. **Um teste que falha pelo motivo errado ainda é informação.** O corpo de 120 KB do teste do S5 revelou que o erro
    413 do body-parser virava 500 (S11). Ler o log pelo id de correlação levou ao achado.
21. **Antes de impor um limite, meça o legado.** O legado quebra em 170 níveis de categorias; o novo aguenta mais de
    1.000. O limite deixou de ser correção urgente e virou decisão de produto (DUV-CAT-007).
22. **Corrigir uma regressão pode abrir uma falha.** O conserto do login com maiúsculas (uma linha) abriu login sem
    conhecer e-mail (ILIKE). O teste da hipótese do revisor pegou; o padrão agora tem um sensor permanente.
23. **Quando a ferramenta de verificação quebra, o aceite vira código.** O Playwright interativo travou num diálogo
    do Chrome; o E2E versionado, com perfil limpo, é melhor evidência — roda de novo, na CI, e com a CSP ativa.
24. **Toda tela nova passa a ser um contrato duplo:** o do legado (mensagens, campos) e o do app antigo com quem ela
    divide a origem (chaves do localStorage, rota de entrada `#!/dashboard`).
25. **"Tudo dá 500" merece uma olhada no log antes de virar achado.** A primeira causa era o ambiente (maiúsculas no
    caminho das views) — que também é fato do legado em produção Linux, mas escondia as regras de verdade.
26. **Sensor que depende do volume de dados envelhece.** Um caso que procurava o registro novo numa lista limitada
    passou a falhar depois de dezenas de rodadas; a ordenação decrescente o tornou independente do acúmulo.
27. **Um vermelho só conta se for pelo motivo certo.** Os primeiros vermelhos de dois achados eram o limite de
    requisições, não a falha. Mutação depois da correção é o que prova que o teste pega o defeito.
28. **Quando o defeito está no código que não se pode editar, a barreira vai na porta de escrita.** O legado injeta o
    nome do banco em HTML sem escapar; o sistema novo é a única via para gravar esse nome, e é lá que ele é validado.
29. **Sequências independentes colidem com o tempo.** Um caso que usava "um id de outra tabela" como pai inválido
    passou a acertar um id válido quando uma sequência ultrapassou a outra.
