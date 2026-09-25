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
| Rastreabilidade | sensor computacional | comportamento | `tools/rastreabilidade.mjs` | ✅ |
| Validação de specs ao editar | sensor computacional | manutenibilidade | hook `depois-de-editar` | ✅ |
| Typecheck ao editar | sensor computacional | manutenibilidade | hook `depois-de-editar` | 🟡 dormente até existir `api/` |
| CI | sensor computacional | todas | `.github/workflows/harness.yml` | 🟡 escrito, 1ª execução no próximo push |
| Regras de camadas | sensor computacional | arquitetura | `dependency-cruiser` em `api/` | ⏳ junto com o `design.md` |
| Isolamento de tenant | sensor computacional | arquitetura | teste estrutural em `api/` | ⏳ junto com o `design.md` |
| Revisão de segurança | sensor inferencial | arquitetura | subagente `security-reviewer` | ✅ 1ª execução: 12 achados nas specs de `contas` (`docs/revisoes/`) |
| *Garbage collection* | sensor recorrente | manutenibilidade | agente agendado (rastreabilidade + drift spec × código) | ⏳ quando houver código |

## Como usar

```bash
docker compose up -d --build                         # oráculo em :8081 (MySQL :33061)
node tools/paridade.mjs                              # golden master contra o legado
node tools/paridade.mjs --base http://localhost:3000 --alvo novo  # contra o novo, com divergências aprovadas (ADR)
node tools/oraculo-sql.mjs PUT /api/bill_pays/12 '{…}' # SQL que a requisição dispara no legado
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
