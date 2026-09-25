# Harness do sisfin-modernizacao

> **Harness** é tudo em volta do agente de IA exceto o modelo: contexto, permissões, ferramentas, testes e revisões.
> Aqui ele existe para que agentes possam implementar a migração **sem que alguém precise conferir tudo à mão**.
> Modelo mental: [Birgitta Böckeler — Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)
> (**guias** atuam antes da ação, **sensores** depois; cada um pode ser **computacional** ou **inferencial**).

## Por que numa migração o harness rende tanto

O harness de **comportamento** é o mais difícil de construir em projetos comuns: testes escritos por IA não dão confiança.
Numa migração existe um **oráculo executável** — o legado rodando — então o sensor de comportamento
não depende de alguém escrever os testes certos: ele compara com a realidade (golden master).

## Mapa

| Peça | Tipo | Categoria | Onde | Status |
|---|---|---|---|---|
| Contexto do projeto | guia inferencial | todas | `.claude/CLAUDE.md` | ✅ |
| Comandos do processo | guia inferencial | comportamento | `.claude/commands/` | ✅ |
| Subagentes só-leitura | guia computacional | — | `.claude/agents/` (`tools: Read, Grep, Glob`) | ✅ |
| Legado somente leitura | guia computacional | — | `deny: Edit(/legacy/**)` + hook `antes-de-editar` | ✅ |
| Aprovação amarrada ao hash | guia computacional | — | `tools/aprovar-tasks.mjs` + hook `antes-de-editar` | ✅ |
| Oráculo reproduzível | infraestrutura | comportamento | `docker-compose.yml` + `DeterministicSeeder` | ✅ |
| Golden master | sensor computacional | comportamento | `tools/paridade.mjs` + `.specs/paridade/` | ✅ 8 casos |
| Observabilidade do oráculo | sensor computacional | comportamento | `tools/oraculo-sql.mjs` | ✅ |
| **Espelho de leitura** | sensor computacional | comportamento | `tools/espelho.mjs` — logo após o ETL, cada GET tem de responder **igual** (valores) no legado e no novo, usando as URLs do **tráfego real** do SPA | ✅ 20/20 rotas (etapa 19: + `/api/banks` e `/api/bank_accounts/{id}?include=bank`) |
| **Tráfego real do front** | guia/oráculo | comportamento | `.specs/legado/trafego-spa.md` — chamadas capturadas com Playwright em cada tela do SPA antigo | ✅ 9 telas |
| **As duas versões lado a lado** | verificação humana | comportamento | mesma tela em :8082 (API antiga) e :8083 (API nova) | ✅ |
| Rastreabilidade | sensor computacional | comportamento | `tools/rastreabilidade.mjs` | ✅ |
| Validação de specs ao editar | sensor computacional | manutenibilidade | hook `depois-de-editar` | ✅ |
| Typecheck ao editar | sensor computacional | manutenibilidade | hook `depois-de-editar` | ✅ ~4 s por edição em `api/` |
| CI | sensor computacional | todas | `.github/workflows/harness.yml` — jobs `api` (tipos, camadas, unitários) e `sistema` (legado + novo, ETL, espelho, paridade nos 2 alvos, integração) | 🟡 ensaio local verde; 1ª execução real no próximo push |
| Teste de mutação | sensor de sensor | comportamento | remover o `FOR UPDATE` → o teste de concorrência tem de falhar | ✅ falhou 3/3 (T12) |
| Regras de camadas | sensor computacional | arquitetura | `api/.dependency-cruiser.cjs` (hook + CI) + lint de SQL cru | ✅ mensagens dizem o que fazer |
| Isolamento de tenant | sensor computacional | arquitetura | teste estrutural em `api/` | ⏳ junto com o `design.md` |
| Revisão de segurança | sensor inferencial | arquitetura | subagente `security-reviewer` | ✅ 2 execuções: specs (12 achados) e código (11 achados, 0 altos) — `docs/revisoes/` |
| **Hipótese → teste que falha → correção** | disciplina | todas | todo achado inferencial marcado como hipótese vira um teste que falha antes de corrigir | ✅ deadlock, rate limit por caixa, corrida no lockout |
| *Garbage collection* | sensor recorrente | manutenibilidade | agente agendado (rastreabilidade + drift spec × código) | ⏳ quando houver código |

## Como usar

```bash
docker compose up -d --build                         # oráculo em :8081 (MySQL :33061)
node tools/paridade.mjs                              # golden master contra o legado
node tools/paridade.mjs --base http://localhost:3300 --alvo novo  # contra o novo, com divergências aprovadas (ADR)
node tools/oraculo-sql.mjs PUT /api/bill_pays/12 '{…}' # SQL que a requisição dispara no legado
node tools/migrar-dados.mjs && node tools/espelho.mjs  # ETL e comparação de leituras legado × novo
node tools/reparar-oraculo.mjs                        # desfaz, pela API, o estrago de propósito dos casos RN-CAT-003/009
                                                      # (rode depois da paridade no legado e antes do ETL)
node tools/rastreabilidade.mjs                       # RN → REQ → Task → Paridade
node tools/aprovar-tasks.mjs contas "Francisco"      # HUMANO aprova o plano (grava o hash)
node --test tools/testes/harness.test.mjs            # testes do próprio harness
```

No Git Bash, prefixe `oraculo-sql.mjs` com `MSYS_NO_PATHCONV=1` (senão `/api/...` vira caminho do Windows).

## Viabilidade (avaliada em 25/09/2026)

| Peça | Custo | Benefício | Veredito | Evidência |
|---|---|---|---|---|
| Oráculo em Docker | ~1 h; imagem PHP 7.1 via `archive.debian.org` | Sem ele não existe sensor de comportamento | ✅ viável | Subiu na 1ª tentativa; migrations + seed OK |
| Seed determinístico | ~15 min, fora de `legacy/` | Dados iguais a cada reset | ✅ viável | Mesmo hash dos dados em 2 resets |
| Golden master HTTP | ~200 linhas | Sensor de comportamento reaproveitável no sistema novo | ✅ **maior retorno** | 8 casos estáveis após reset; revelou 6 bugs |
| `oraculo-sql` | ~50 linhas | Evidência de transação/efeitos que a leitura do PHP não dá com certeza | ✅ alto retorno | Provou a RN-CON-007 (extrato fora da transação) |
| Hooks pre/post | ~120 linhas | Correção imediata, antes do CI | ✅ viável | 5 testes automatizados + simulações |
| Aprovação por hash | ~40 linhas | Plano aprovado ≠ plano executado vira impossível sem aviso | ✅ viável | Testado: alterar o plano derruba a aprovação |
| CI | ~40 linhas YAML | Gate que não depende da sessão local | 🟡 provável | Não executado ainda; runner Ubuntu roda `mysql:5.7` amd64 |
| Typecheck por edição | `tsc --noEmit` 5–20 s | Erros de tipo corrigidos na hora | 🟡 viável; medir | Trocar para `--incremental` se passar de 20 s |
| Lint de arquitetura / tenant | ~1 h cada | Impede *drift* e vazamento entre clientes | ⏳ adiado | Sem camadas definidas ainda |
| *Garbage collection* | agendamento | Evita que spec e código se afastem | ⏳ adiado | Sem código novo ainda |

### Limites conhecidos (o que o harness NÃO garante)

- **Não é fronteira de segurança.** Os hooks interceptam `Edit/Write`; um comando `Bash` que escreve arquivo passa por fora. O gate definitivo é o CI + revisão humana do PR.
- **Diagnóstico errado passa.** A premissa "o admin não tem cliente" (DUV-CON-006) estava errada e nenhum sensor pegaria — só a sonda no oráculo.
- **O oráculo reproduz o código, não o ambiente original.** A versão do ICU (63.1 na imagem `php:7.1-apache`) muda o resultado da busca (RN-CON-016). Diferença que pode ser de ambiente vira dúvida, não regra.
- **O oráculo tem rate limit (60/min, RN-AUT-002).** Rodar a suíte várias vezes seguidas gera 429; o executor espera o `Retry-After` e avisa no stderr — a suíte fica mais lenta, não falsa.
- **Datas do seed são relativas ao dia do seed.** Os casos usam deltas e dados próprios; nunca valores absolutos do seed.
- **O oráculo tem prazo de validade.** Antes de desligar o legado, os casos de paridade viram testes de regressão do sistema novo (o `esperado` já capturado continua valendo).
- **Harness também é código**: cresce e precisa de manutenção. Os testes em `tools/testes/` existem por isso.
