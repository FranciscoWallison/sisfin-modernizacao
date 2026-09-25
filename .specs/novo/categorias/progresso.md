# Progresso — módulo `categorias` (escrita)

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 11 regras com evidência (código, SQL observado, `EXPLAIN`, MySQL); 6 casos de paridade verdes no legado | Achados: IDOR na edição (RN-CAT-003), exclusão parcial com órfãs (RN-CAT-009), ordem por id (RN-CAT-011) |
| TO-BE | ✅ | requirements, ADR-007, design e tasks aprovados (hash `baf1b8d63868`) | |
| G01. Leitura na ordem do legado | ✅ | Espelho logo após o ETL, com categorias movidas: **2 rotas com diferença → 0** ao trocar `_lft` por `id`; `RN-CAT-011` verde no novo depois da G04 | Bug latente no compat (T08), invisível com as árvores do seed |
| G02. Domínio: árvore | ✅ | `test/categorias-dominio.spec.ts` (13): numeração DFS em ordem de id, faixas contíguas, ciclo e órfã → `ArvoreInvalida`, 20 mil níveis sem estourar a pilha, **200 florestas aleatórias** com as invariantes | |
| G03. Repositório e serviço | ✅ | `test/categorias.integracao.spec.ts` (7): invariantes depois de criar/mover/promover/excluir; **nenhuma linha de outro cliente muda** (snapshot); B edita/move/exclui → 404 e linha idêntica; 10 escritas concorrentes; conta numa neta → 422 e nada apagado; fluxo de caixa segue a categoria movida; árvore corrompida → 500 com rollback. **Mutação:** sem o advisory lock, o teste de concorrência falha | O teste F03 do fluxo passou a medir a profundidade por cliente (consequência do ADR-007) |
| G04. HTTP | ✅ | **`paridade --alvo novo categorias/`: 6/6 de primeira**; 22/22 no total, nos dois alvos | A leitura saiu do compat |
| G05. Tela | ✅ | `#!/plan-account` em :8083: criar raiz (`{"id":0,"name":…}` → 201), criar filha (`parent_id` **em texto**, `"167"` → 201), editar e promover a raiz (sem `parent_id` → 200), excluir (204). `docs/imgs/spa-novo-plano-de-contas-escrita.png` | O menu de ações abre no hover e só existe para itens carregados com a página (é do front, igual nos dois lados) |
| G06. Segurança | ✅ | `docs/revisoes/2026-09-25-security-categorias-contas-bancarias.md`: 0 altos. Corrigidos S1 (O(n²): **7–10 s** com 30 mil categorias → linear), S2 (lock sem limite → 409 em 3 s), S3, S4 e S6, cada um com teste que falhou antes. S5 e S11 eram **globais** (login incluído) | DUV-CAT-007 (limite de profundidade) aberta: o legado quebra em 170 níveis |
| G07. Documentação | ✅ | progresso, design (mudanças), diário (etapa 19), README, inventário; CI com `categorias/` no `--alvo novo` e jest em série | |

## Resultado do módulo

- Paridade no sistema novo: **6/6** (22/22 somando todos os módulos); espelho **20/20**.
- Divergências intencionais (ADR-007):
  - IDOR corrigido;
  - ciclo e exclusão com contas → 422;
  - exclusão tudo ou nada.
- Pendências: DUV-CAT-004 (órfãs no cutover), DUV-CAT-007 (limite de profundidade).
