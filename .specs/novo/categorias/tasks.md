Status: aprovado · Aprovado por: Francisco · Em: 2026-09-25 · Hash: baf1b8d63868

# Tasks — módulo `categorias` (escrita)

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs categorias "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **G01. Leitura na ordem do legado** — o compat passa a ordenar a árvore por id. Aceite: `paridade --alvo novo categorias/RN-CAT-011` + espelho `/api/category_*` sem diferença com a base atual do oráculo (que já tem categorias movidas). **REQ-CAT-08**.
- [ ] **G02. Domínio: árvore** — `domain/arvore.ts` (`numerar`, `descendentes`, `profundidade`) e `domain/serializacao.ts` + testes (floresta, ordem por id, faixas contíguas, ciclo e órfã lançam erro). **REQ-CAT-01, REQ-CAT-04, REQ-CAT-05, REQ-CAT-08**.
- [ ] **G03. Repositório e serviço** — transação com `pg_advisory_xact_lock(árvore, cliente)`, 404 para id alheio, 422 para pai inválido ou ciclo, exclusão tudo ou nada, renumeração só do cliente. Aceite: integração no Postgres (invariantes; outras linhas intocadas; 10 escritas concorrentes; conta numa neta bloqueia a exclusão; fluxo de caixa segue a categoria movida). **REQ-CAT-01, REQ-CAT-03, REQ-CAT-04, REQ-CAT-05, REQ-CAT-06**.
- [ ] **G04. HTTP** — DTO (`id` ignorado, mensagens do Laravel) e controller das duas árvores; leitura sai do compat. Aceite: `paridade --alvo novo categorias/` (6 casos, com as divergências do ADR-007). **REQ-CAT-01, REQ-CAT-02, REQ-CAT-03, REQ-CAT-04, REQ-CAT-05, REQ-CAT-06, REQ-CAT-07**.
- [ ] **G05. Tela** — `#!/plan-account` em :8083: criar raiz e filha, editar, mover, excluir (Playwright + screenshot em `docs/imgs/`). **REQ-CAT-01, REQ-CAT-06, REQ-CAT-07**.
- [ ] **G06. Segurança** — `security-reviewer` no código do módulo (foco: renumeração fora do cliente, IDOR, advisory lock); achados viram testes que falham antes da correção. **REQ-CAT-03**.
- [ ] **G07. Documentação** — progresso, diário, README, inventário; CI com `categorias/` no `--alvo novo`.
