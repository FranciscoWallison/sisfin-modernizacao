Status: rascunho — aguardando aprovação do Francisco

# Design — módulo `categorias` (escrita) — TO-BE

> Implementa `requirements.md` (REQ-CAT-01..08). Reaproveita a fundação (auth-compat, tenant, formato HTTP, sensores).
> Contrato: `.specs/legado/modulos/categorias/contrato.md`. Correções: ADR-007 (proposto).

## 1. Estrutura (`api/src/modules/categorias/`)

```text
domain/
  arvore.ts          numeração nested set a partir de parent_id; detecção de ciclo; subárvore  (puro)
  serializacao.ts    categoria → { id, name, parent_id, depth, created_at, updated_at, children: { data } }, ordem por id
infra/
  categorias.repositorio.ts   leituras/escritas via PRISMA_TENANT + renumeração do cliente (SQL cru com clientId)
application/
  categorias.service.ts       criar / editar / excluir numa transação com lock por (árvore, cliente)
http/
  categoria.dto.ts            name, parent_id, id (ignorado)
  categorias.controller.ts    /api/category_revenues e /api/category_expenses (o tipo vem da rota, nunca do corpo)
```

A leitura da árvore sai do `compat/` e passa para este módulo, com a mesma serialização. O `GET /{id}` é novo no
sistema novo. As regras de camadas da T02 valem sem mudança.

## 2. Nested set por cliente (domain/arvore.ts)

O legado numera `_lft/_rgt` **globalmente**, com faixas de clientes intercaladas (cliente 4: 1..278; cliente 2:
33..299). Manter isso obrigaria toda escrita a deslocar linhas de **outros clientes**, com um UPDATE sem filtro de
tenant e um lock na tabela inteira.

Decisão: depois de cada escrita, **recalcular a numeração só do cliente**, a partir de `parent_id`:

```ts
numerar(nos: { id: number; parentId: number | null }[]) → Map<id, { lft, rgt }>
  // DFS com raízes e irmãs em ordem de id (RN-CAT-011); lft começa em 1 para cada cliente
  // lança ArvoreInvalida se houver ciclo ou parent_id fora do conjunto (órfã)
descendentes(nos, id) → Set<id>        // para ciclo (REQ-CAT-04) e exclusão (REQ-CAT-05)
profundidade(nos, id) → number          // depth da resposta
```

- **Por que é seguro:**
  - todo uso de `_lft/_rgt` compara também `client_id` (fluxo de caixa, design de `fluxo-de-caixa` §3), então faixas
    sobrepostas entre clientes são inofensivas;
  - a leitura monta a árvore por `parent_id`, não por `_lft`.
- **Custo:** O(n) por escrita, com n = categorias do cliente naquela árvore (60 no maior cliente do seed). Só as
  linhas cuja numeração mudou são atualizadas.
- **Migração:** os dados vindos do ETL continuam com a numeração global até a primeira escrita do cliente naquela
  árvore. As duas numerações satisfazem a containment por cliente.

## 3. Escritas (application) — uma transação por operação

```text
BEGIN
  SELECT pg_advisory_xact_lock(<1=receitas|2=despesas>, clientId)     -- serializa escritas da árvore do cliente
  carrega (id, parent_id) de todas as categorias do cliente na árvore
  PUT/DELETE: id da rota fora do conjunto → 404 (nada gravado)          -- REQ-CAT-03
  parent_id fora do conjunto → 422 parent_id                            -- REQ-CAT-02 (mesma tabela, mesmo cliente)
  PUT: parent_id ∈ {id} ∪ descendentes(id) → 422 parent_id              -- REQ-CAT-04
  DELETE: existe bill_* com category_id ∈ subárvore → 422 message       -- REQ-CAT-05 (antes de apagar qualquer coisa)
  grava (INSERT / UPDATE name, parent_id / DELETE subárvore)
  numerar(...) → UPDATE _lft/_rgt das linhas que mudaram (WHERE client_id = $c)
COMMIT
```

- A validação do corpo (DTO) acontece antes, no pipe: corpo inválido → 422 mesmo para id alheio, como no legado.
- **Ordem de locks:** só um advisory lock por operação. O módulo `contas` trava contas bancárias, mas não categorias,
  então não há ciclo de espera. Para a janela entre a checagem de contas e o DELETE, a FK `bill_*.category_id`
  continua valendo: um P2003 vira o mesmo 422.
- **Renumeração em SQL cru:** fica só em `infra/`, com `clientId` explícito (regra da T02). As tabelas vêm de uma
  constante (`Prisma.raw`) e nunca da entrada.

## 4. HTTP

| Rota | Resposta |
|---|---|
| `GET /api/category_*` | árvore (raízes em ordem de id) — substitui o compat |
| `GET /api/category_*/:id` | 200 com a subárvore; 404 se não for do cliente |
| `POST /api/category_*` | 201 |
| `PUT /api/category_*/:id` | 200 |
| `DELETE /api/category_*/:id` | 204 sem corpo (o legado manda `[]`; o cliente HTTP descarta) |

- **DTO:** `name` (`IsString`, `IsNotEmpty`, `MaxLength(255)`, com as mensagens do Laravel); `parent_id` (inteiro
  opcional; `null`/ausente = raiz); `id` com `@Allow()` e **descartado** (REQ-CAT-07).
- **Tipo da árvore:** vem de um parâmetro de rota fixo (`receitas`/`despesas`) mapeado para a tabela por constante.
- `@ComCliente()` em todas as rotas; rate limit e formato de erro herdados.

## 5. Testes

| Nível | O quê |
|---|---|
| Unitário | `numerar` (floresta, filhas em ordem de id, lft/rgt contíguos, ciclo e órfã lançam erro), `descendentes`, `profundidade`, DTO (id ignorado, campo extra → 422, mensagens) |
| Integração (Postgres) | invariantes após criar/mover/excluir (`lft < rgt`, containment ⇔ ancestral, faixas contíguas por cliente); **linhas de outro cliente intocadas** (snapshot antes/depois); 10 escritas concorrentes no mesmo cliente → árvore válida; `DELETE` com conta numa neta → 422 e nada apagado; fluxo de caixa depois de mover categoria (a soma vai para a nova raiz) |
| Paridade | `categorias/*.json` com `--alvo novo` (6 casos) |
| Espelho | `/api/category_*` sem diferença (inclusive depois das sondas — RN-CAT-011) |
| Tela | `#!/plan-account` em :8083: criar, editar, mover, excluir (Playwright + screenshot) |

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Renumerar escreve fora do cliente por engano | `WHERE client_id = $c` no UPDATE + teste de snapshot das outras linhas + `security-reviewer` |
| Base migrada com órfãs ou árvores entre clientes: `numerar` lança erro | O ETL bloqueia o cutover nesses casos (DUV-CAT-004). No runtime, `ArvoreInvalida` vira 500 com log, sem gravar nada |
| O fluxo de caixa depender da numeração global | Não depende: o JOIN tem `c.client_id = r.client_id` (F03) — há teste de integração |
| Ordem por id não ser "contrato" no legado | É a ordem de fato, provada por sonda e `EXPLAIN` (RN-CAT-011); o espelho vigia |
