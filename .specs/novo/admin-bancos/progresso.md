# Progresso — módulo `admin-bancos`

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 7 regras, 7 dúvidas, contrato; 2 sondas reproduzíveis (`tools/sondas/admin-*.mjs`) | Em Linux o admin inteiro dá 500 (views em `Admin/`); criar e editar nunca funcionaram; `/admin/register` público |
| TO-BE | ✅ | requirements, ADR-010, design e tasks aprovados (hash `bb0f9a303b2e`) | |
| A01. Listagem e autorização | ✅ | `test/admin-bancos.integracao.spec.ts`: 401 sem token e 403 para cliente em todas as rotas, sem gravar banco nem arquivo; 5 por página em ordem de id; logo absoluto; paginação | Mutação (guard deixando passar): os testes de 403 falham |
| A02. Upload seguro | ✅ | `test/admin-bancos-dominio.spec.ts` (20): assinaturas reais, SVG/HTML/GIF/vazio/truncado recusados, 1 MB passa e 1 MB + 1 não, nomes removíveis. Integração: texto `.png` → 422; 1 MB + 1 → o mesmo 422 (não 413); JPEG enviado como `foto.png` vira `.jpg` | `ARQUIVOS_DIR` na config validada (caminho absoluto) |
| A03. Criar, editar e excluir | ✅ | Integração: com e sem logo; só o nome mantém o logo; troca apaga o antigo; `default.jpg` intocado; logo compartilhado preservado; falha no banco não deixa arquivo (criar e editar); excluir → 204 e arquivo removido; em uso (conta de qualquer cliente) → 422 e nada muda; 404 | Mutações: sem a limpeza do novo, sem a checagem de compartilhado, sem a remoção do antigo → cada uma derruba um teste |
| A04. Servir e migrar logos | ✅ | `curl`: PNG enviado como `x.html`/`text/html` → gravado `.png`, servido `image/png` com CSP sandbox e `nosniff`; ausente → `banco-padrao.svg`. Espelho 20/20 com `ASSETS_URL` na `:8083`. `tools/testes/migrar-logos.test.mjs` (4). Execução real: seed → 3 ausentes | A API passou a rodar como `node` (não root) |
| A05. Telas no `web/` | ✅ | `web/e2e/admin-bancos.e2e.ts` (4): fluxo do admin com PNG (logo decodificado, `naturalWidth` 1), texto disfarçado recusado na tela, edição mantém o logo, exclusão; banco em uso mostra a mensagem; cliente sem link e com acesso negado; `/admin/register` e `/admin/password/reset` → não encontrada. Vitest 24 (+12) | `docs/imgs/web-admin-*.png` |
| A06. Segurança e documentação | ✅ | [`docs/revisoes/2026-09-26-security-admin-bancos.md`](../../../docs/revisoes/2026-09-26-security-admin-bancos.md): S1 (média, XSS pelo nome no app antigo) e S2–S4 corrigidos, cada um com teste vermelho antes e mutação depois; S5 (dono/modo dos arquivos copiados) corrigido e conferido numa execução real; S6/S7 aceitos. CI: teste e execução do `migrar-logos`, E2E do admin | |

## Resultado do módulo

- O admin de bancos saiu do Blade: API `/api/admin/banks` (só admin) + telas Vue 3 no `web/`, pelo login único.
- Criar e editar banco **funcionam pela primeira vez** (no legado sempre deram 500), com upload validado pelo conteúdo.
- Logos num volume próprio, servidos pelo nginx da `:8083` no mesmo caminho do legado, com imagem padrão para os
  ausentes.
- Números no fechamento: API 389 testes; web 24 unitários + 11 E2E; espelho 20/20.

## Pendências

| Item | Onde | Quando |
|---|---|---|
| ETL relatar nomes de banco com `< > " '` (a barreira do S1 vale só para o que entra pela API) | `tools/migrar-dados.mjs` | Antes de um cutover real |
| Varredura de arquivos órfãos no volume (S3 caso a: queda entre gravar o arquivo e o commit) | ferramenta/job | Melhoria |
| Paridade RN-CAT-001 intermitente no oráculo **local** acumulado: a sequência de receitas passou a de despesas e o id da despesa nova colide com uma receita do mesmo cliente (conferido no MySQL: despesa 379 × receita 379, cliente 2). Não é regressão; na CI o oráculo nasce limpo | `.specs/paridade/categorias/RN-CAT-001-arvore.json` | Próximo ciclo (o caso precisa de um pai "de outra árvore" que não colida) |
