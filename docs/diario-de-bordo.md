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

**Próximo passo:** Francisco revisa `design.md`, `tasks.md` e o ADR-004; aprova o plano com `node tools/aprovar-tasks.mjs contas "Francisco"`. Depois, Fase A (T01–T08).

---

## Lições até aqui

1. **Sondar antes de concluir.** Duas hipóteses minhas estavam erradas (admin sem cliente; dia 31 quebrado) e só a sonda mostrou.
2. **O oráculo tem ambiente.** Versão de ICU mudou o comportamento da busca — fixar a imagem e tratar diferenças de ambiente como dúvida.
3. **Sensores computacionais baratos pagam rápido.** A rastreabilidade pegou erro de formatação; o `oraculo-sql` provou regra de transação que a leitura do PHP só sugeria.
4. **Bug encontrado vira decisão, não correção silenciosa.** Cada comportamento corrigido tem ADR e bloco `divergencias`.
