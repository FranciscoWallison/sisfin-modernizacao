# Regras de negócio — módulo `categorias` (escrita) — AS-IS

> Levantadas em 25/09/2026: leitura de `legacy/app/Http/Controllers/Api/CategoriesControllerTrait.php`,
> `legacy/app/Repositories/Traits/CategoryRepositoryTrait.php`, `legacy/app/Models/AbstractCategory.php` e
> `legacy/app/Http/Requests/CategoryRequest.php`; sondas no oráculo (cliente A = `cliente1@user.com`, cliente 2;
> cliente B = `cliente3@user.com`, cliente 4) e casos em `.specs/paridade/categorias/`.
> A LEITURA (`GET` da árvore) já existe no sistema novo (`api/src/compat/`, T08 de `contas`).

Receitas (`/api/category_revenues`) e despesas (`/api/category_expenses`) são **duas árvores independentes** com o
mesmo código (trait), em tabelas separadas, cada uma em *nested set* (`kalnoy/nestedset`: `_lft`, `_rgt`, `parent_id`).

### RN-CAT-001 — Criar e editar na própria árvore; resposta com `depth` e `children`
- **Regra:** `POST` cria raiz (sem `parent_id`) ou filha (`parent_id` de uma categoria do próprio cliente) → 201.
  `PUT` renomeia e/ou move → 200. `GET /{id}` devolve a categoria com `depth` e `children.data` (recursivo).
  Formato igual ao da leitura da árvore (`contrato.md`).
- **Evidência:** `CategoriesControllerTrait.php` (`store`/`update` re-leem com `find($id)` "serializada com a profundidade")
- **Sonda:** `RN-CAT-001-arvore.json` (raiz depth 0, filha depth 1 apontando para a raiz, renomear mantendo o pai);
  `contas-bancarias/RN-CBA-007-…json` (`categoria_show_formato`) ✅
- **Limite observado (sonda de 25/09, revisão de segurança S6):** uma cadeia de categorias é servida até **169 níveis**;
  no 170º, `GET /api/category_*` e `GET /{id}` da raiz dão **500** — a árvore inteira do cliente deixa de abrir (o
  `json_encode` do PHP tem profundidade máxima 512; cada nível consome 3). O `POST` do 170º nível é aceito (201).
  Sonda: `PROF-…` em `category_revenues`, com limpeza no fim. Sem caso de paridade: 170 escritas por execução.
  Decisão sobre um limite no sistema novo: DUV-CAT-007.
- **Confiança:** alta

### RN-CAT-002 — Validação: `name` obrigatório; `parent_id` do MESMO cliente e do MESMO tipo
- **Regra:** `name` required, máx. 255 → 422. `parent_id` precisa existir **na mesma tabela** e com `client_id` do
  usuário → senão 422 `"The selected parent id is invalid."` (vale para criar e editar).
- **Evidência:** `CategoryRequest.php:26-45` (`Rule::exists($this->getTable(), 'id')->where('client_id', …)`)
- **Sonda:** `RN-CAT-001` (`sem_nome` 422, `receita_com_pai_de_despesa` 422); `RN-CAT-003` (`b_cria_filha_sob_a` 422) ✅
- **Confiança:** alta

### RN-CAT-003 — 🔴 CRÍTICO: outro cliente EDITA e MOVE categorias alheias (a resposta é 404, a escrita acontece)
- **Regra (observada):** `PUT /api/category_*/{id de A}` feito por B:
  - só com `name` → a categoria de A é **renomeada** e vira **raiz** (`makeRoot`);
  - com `parent_id` de uma categoria de B (passa na validação, que só olha o `parent_id`) → a categoria de A é
    renomeada e **movida para dentro da árvore de B**.
  Em ambos os casos a resposta é **404** — o atacante "vê" um erro, mas o dano está feito.
- **Mecanismo:** `CategoryRepositoryTrait::update` desliga o tenant (`$model::$enableTenant = false`) e usa `find($id)`
  sem filtro de cliente; o 404 vem do `find` que o controller faz **depois**, já com o tenant religado.
- **Cadeia de vazamento (sonda manual, 25/09):** A lança uma conta de 4242 na categoria 124 (movida para a raiz 125 de B)
  → o **fluxo de caixa de B** passa a mostrar 4242 em ago/2018 sob a raiz 125 (o agregado usa `_lft/_rgt` da raiz —
  RN-FLX-007) → a categoria some da árvore de A. Ou seja: **escrita cruzada + vazamento de valores financeiros**.
- **Evidência:** `CategoryRepositoryTrait.php:26-46`, `AbstractCategory.php:25-36` (`newQuery` com `$enableTenant`)
- **Sonda:** `RN-CAT-003-edicao-entre-clientes.json` — `b_renomeia` 404 e `b_move_para_sua_arvore` 404, mas
  `nome_intacto_apos_ataque: false` e `filha_continua_na_arvore_de_a: false` ✅
- **Efeito no oráculo local:** as categorias 124 e 135 estão na árvore de outro cliente — o ETL agora acusa
  (`tools/migrar-dados.mjs`, seção "Árvores de categorias entre clientes")
- **Confiança:** alta · **Suspeita de bug?** **sim — vulnerabilidade** (DUV-CAT-001)

### RN-CAT-004 — Ciclo: mover para dentro de si mesma ou de uma descendente → 500
- **Regra:** `PUT` com `parent_id` = a própria categoria ou uma descendente → **500** (`LogicException` do nestedset);
  nada muda.
- **Evidência:** `vendor/kalnoy/nestedset/src/NodeTrait.php:1138-1141` (`assertNotDescendant` → `LogicException("Node must not be a descendant.")`), chamado no `save` ao trocar o pai
- **Sonda:** `RN-CAT-004-ciclos-e-exclusao-com-contas.json` (`raiz_dentro_da_neta` 500, `pai_de_si_mesma` 500) ✅
- **Confiança:** alta · **Suspeita de bug?** sim — deveria ser 422 (DUV-CAT-002)

### RN-CAT-005 — Excluir: leva as descendentes; categoria COM contas → 500
- **Regra:** `DELETE` → 204 e **todas as descendentes são apagadas junto** (nested set). Se a própria categoria tem
  contas (`bill_*`) → **500** (FK) e nada é apagado.
- **Evidência:** `CategoriesControllerTrait::destroy` → `repository->delete` → `NodeTrait.php:57-59,628` (`deleteDescendants` por `_lft/_rgt`)
- **Sonda:** `RN-CAT-001` (`excluir_raiz` 204, `filha_depois_de_excluir_a_raiz` 404); `RN-CAT-004`
  (`excluir_neta_com_conta` 500, `neta_continua_existindo` 200) ✅
- **Confiança:** alta · **Suspeita de bug?** 500 em vez de 422/409 (DUV-CAT-002)

### RN-CAT-006 — Ler, criar sob e excluir categorias de OUTRO cliente: bloqueado
- **Regra:** `GET`/`DELETE` de categoria alheia → 404 e nada muda; criar filha sob categoria alheia → 422 (RN-CAT-002).
  (A exceção é a EDIÇÃO — RN-CAT-003.)
- **Sonda:** `RN-CAT-003` (`b_le` 404, `b_exclui` 404, `a_ainda_tem_a_raiz` 200, `b_cria_filha_sob_a` 422) ✅
- **Confiança:** alta

### RN-CAT-007 — Editar SEM `parent_id` torna a categoria RAIZ
- **Regra:** `PUT` sem `parent_id` (ou com `null`) → `makeRoot()`: a categoria sai de onde estava e vira raiz.
  É o contrato da tela: o formulário do plano de contas **omite** `parent_id` quando o usuário escolhe "nenhuma"
  (categoria raiz) — então não é bug, é a forma de "promover" uma categoria.
- **Evidência:** `CategoryRepositoryTrait.php:40-42`; SPA `legacy/resources/assets/spa/js/store/category.js:119-123` (`save`: `if (parent_id === null) delete categoryCopy.parent_id`); edição abre com o `parent_id` atual (`mixins/category-mixin.js:83-89`)
- **Sonda:** `RN-CAT-001` (`renomear_filha_sem_pai` → `parent_id: null`, `depth: 0`) ✅
- **Confiança:** alta · **Decisão:** manter (compatibilidade com a tela)

### RN-CAT-008 — Árvores de receita e de despesa são separadas
- **Regra:** mesmas regras nos dois recursos; `parent_id` sempre da **mesma** tabela (RN-CAT-002); ids em sequências
  independentes (uma receita e uma despesa podem ter o mesmo id).
- **Evidência:** `CategoryExpensesController` / `CategoryRevenuesController` usam o mesmo trait; `CategoryRequest::getTable`
- **Sonda:** `RN-CAT-001` (`receita_com_pai_de_despesa` 422) ✅
- **Confiança:** alta

### RN-CAT-009 — 🔴 Excluir raiz cuja FILHA tem contas: 500, mas a raiz JÁ foi apagada (órfãs)
- **Regra (observada):** a raiz é apagada; a exclusão das descendentes falha na FK (a filha tem conta) → **500**.
  Sem transação, o resultado é **parcial**: as filhas ficam com `parent_id` apontando para uma linha inexistente,
  continuam acessíveis por id (`GET` 200) mas **somem da árvore** (a tela lista a partir das raízes) — e as contas
  continuam ligadas a uma categoria invisível. `parent_id` não tem FK, então o banco aceita.
- **Evidência:** `vendor/kalnoy/nestedset/src/NodeTrait.php:57-59` (`static::deleted` → `deleteDescendants()`: o nó é apagado PRIMEIRO, as descendentes depois, sem transação);
  estado no MySQL após a sonda: categorias 150/151 → pai 149 inexistente; 153/154 → pai 152
- **Sonda:** `RN-CAT-009-excluir-raiz-com-filha-com-contas.json` (`excluir_raiz` 500, `raiz_depois` 404,
  filhas 200, `filhas_visiveis_na_arvore: false`) ✅. O ETL agora acusa ("Categorias órfãs")
- **Confiança:** alta · **Suspeita de bug?** **sim — corrompe dados** (DUV-CAT-003, DUV-CAT-004)

### RN-CAT-010 — Corpo que a tela envia: `id` junto (ignorado)
- **Regra:** o SPA manda `{ id: 0, name, parent_id }` ao criar e `{ id, name, parent_id }` ao editar (sem `parent_id`
  quando é raiz — RN-CAT-007). O legado ignora o `id` do corpo: vale o da rota; ao criar, o id é gerado.
- **Evidência:** `legacy/resources/assets/spa/js/mixins/category-mixin.js:73-89` (`modalNew`/`modalEdit`),
  `store/category.js:119-127` (`save` decide criar/editar por `id === 0`); `AbstractCategory::$fillable` sem `id`
- **Sonda:** `RN-CAT-010-corpo-da-tela.json` (201/201/200 e `id_da_rota_prevalece: true` com `id: 1` no corpo) ✅
- **Confiança:** alta · **Impacto no novo:** a whitelist global (`forbidNonWhitelisted`) recusaria o `id` → a tela quebraria

### RN-CAT-011 — Ordem da listagem: raízes e filhas em ordem de ID (não de `_lft`)
- **Regra:** a árvore (`GET /api/category_*`, e `children` em qualquer resposta) sai em **ordem de id**. Mover uma
  categoria (trocar de pai, virar raiz) não muda sua posição relativa.
- **Mecanismo:** as consultas não têm `ORDER BY` (`FindRootCategoriesCriteria::apply` → `whereIsRoot()`;
  `CategoryTransformer.php:38-41` → `children()->withDepth()->get()`); o MySQL usa o índice `client_id`
  (`EXPLAIN`: `key = category_*_client_id_foreign`) e as entradas de um índice secundário do InnoDB vêm na ordem da PK.
  SQL observado com `tools/oraculo-sql.mjs GET /api/category_revenues`.
- **Sonda:** `RN-CAT-011-ordem-da-listagem.json` — R, A, B, C (filhas de R), R2; B vai para R2 e volta; C vira raiz →
  raízes `R,C,R2` e filhas de R `A,B` ✅. Pela ordem de `_lft` seriam `R,R2,C` e `A,B` só por coincidência.
- **Achado no sistema novo:** o compat (T08 de `contas`) ordena por `_lft`; com as árvores do seed as duas ordens
  coincidem, mas depois das sondas o **espelho acusou** `/api/category_revenues` (c1) em 25/09. Corrigir junto com
  este módulo (G01).
- **Confiança:** alta (ordem de fato do legado; não é garantida por contrato SQL, mas é estável com esse plano)
