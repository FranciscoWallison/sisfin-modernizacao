# Revisão de segurança: escrita de `categorias` e `contas-bancarias` (G06 / B07)

- **Data:** 25/09/2026
- **Revisor:** agente `security-reviewer` (somente leitura: Read, Grep, Glob), com conferência humana de cada afirmação.
- **Escopo:**
  - `api/src/modules/categorias/**` e `api/src/modules/contas-bancarias/**`;
  - o que mudou em `shared/` (conversões, serialização, config `ASSETS_URL`) e em `compat/` (`include=bank`, logo);
  - a migration do índice parcial.
- **Regra do projeto:** hipótese do revisor vira **teste que falha antes da correção**, em `api/test/cadastros-seguranca.spec.ts` (unitário) e `api/test/cadastros-seguranca.integracao.spec.ts` (Postgres + HTTP).

## Resultado

**Nenhum achado alto.** O revisor não encontrou caminho que leia, grave, renumere ou apague linha de outro cliente, nem
mass assignment que chegue ao banco. Os achados eram de **disponibilidade**, com impacto entre clientes pela CPU do
event loop e pelo pool de conexões, e de **500 onde deveria ser 4xx**.

Ao escrever os testes, dois achados se mostraram **maiores** do que o revisor supôs (S5 e o novo S11), e um levou a uma
sonda no legado (S6).

## Confirmado correto (sem mudança)

- **Isolamento:**
  - o advisory lock é por cliente;
  - a renumeração usa `UPDATE … WHERE client_id` e confere o número de linhas afetadas;
  - update e delete passam pela extensão de tenant;
  - linha alheia → 404 antes de qualquer escrita.
- **Conta de outro cliente apontando para categoria ou conta bancária de A:**
  - o `count` com tenant não a enxerga, mas a FK `RESTRICT` gera P2003, que vira 422;
  - agora há **teste** para isso (S7).
- **Respostas de erro:** "alheio" e "inexistente" dão a mesma resposta (sem oráculo de existência).
- **Mass assignment:** `id`, `balance`, datas e `bank` são descartados; `client_id` → 422.
- **Locks:**
  - chaves distintas;
  - ordem global por id;
  - nenhum ciclo de espera com o módulo `contas`.
- **Controles do legado:** nenhum controle perdido.

## Achados e desfecho

| id | sev. | achado | teste antes da correção | correção |
|---|---|---|---|---|
| S1 | Média | `numerar`, `montar` e `descendentes` eram **O(n²)**: cópia de array por nó e `shift()`. Com 30 mil categorias, o event loop travava por **7 a 10 s** para **todos** os clientes | ❌ 7.249 ms / 10.482 ms (teto: 300 ms) | `push` no array existente, fila com índice, montagem iterativa → dentro do teto |
| S2 | Média | `pg_advisory_xact_lock` sem limite de espera: escritas simultâneas de um cliente prendiam conexões do pool | ❌ o pedido esperou os 6 s inteiros | `SET LOCAL lock_timeout = '3s'` em cada transação dos dois módulos; 55P03 e P2028 → **409** (repetível) |
| S3 | Baixa | Id fora do `int4` chegava ao Postgres e dava 500 (`bank_id`, `parent_id` e `:id` da rota) | ❌ 422 esperado / 500 | `IdDeReferencia` (1..int4) nos DTOs; `IdDaRotaPipe` na rota → 404 |
| S4 | Baixa | `\u0000` em `name`/`agency`/`account` → o Postgres recusa (22021) → 500 | ❌ | `SemNul` nos DTOs → 422 |
| S5 | Baixa → **Média** (global) | Objeto aninhado a 20 mil níveis → `RangeError` → 500. **A causa não era o DTO:** é o `stripProtoKeys` do `ValidationPipe` do Nest, recursivo e anterior a qualquer DTO. Valia para **toda** rota com corpo, **inclusive o login** | ❌ unitário e HTTP (login e contas a pagar) | Pipe global confere a profundidade **de forma iterativa** antes (máx. 32 → 422); campos ignorados da tela são descartados já na transformação |
| S6 | Baixa | Montagem e serialização recursivas: uma cadeia de 5.000 níveis estourava a pilha → 500 permanente na árvore do cliente | ❌ `Maximum call stack size exceeded` | `montar` e `transformar` iterativos. **Sobra o teto do `JSON.stringify` do V8** (quebra entre 1.000 e 2.000 níveis). **Sonda no legado:** ele serve até **169** níveis e dá 500 na árvore inteira a partir do 170º (`json_encode`, profundidade 512). Sem regressão; limite de profundidade → **DUV-CAT-007** (decisão do Francisco) |
| S7 | Baixa (lacuna) | Conta de outro cliente → FK. Estava correto, **sem teste** | ✅ passou | Testes adicionados (categoria e conta bancária) |
| S8 | Info | Chaves de advisory lock definidas em dois arquivos | — | `shared/prisma/chaves-lock.ts` + teste de unicidade |
| S9 | Info | Árvore corrompida (órfã/cruzada) → 500 com rollback (falha fechada) | já coberto | O bloqueio no ETL continua sendo critério de cutover (DUV-CAT-004) |
| S10 | Info | Links de paginação ainda usam o `Host` (como o legado); sem `NODE_ENV`, o ambiente vira `development` | — | Pendência registrada (fora do escopo destes módulos) |
| **S11** | **Média** (global) — **achado novo, ao testar o S5** | Corpo acima de 100 KB → `PayloadTooLargeError` (413) do body-parser → o filtro **fechado** de exceções o transformava em **500** em qualquer rota | ❌ 500 | O filtro reconhece erros `entity.*` 4xx do body-parser → status próprio com mensagem genérica (413 `Payload Too Large`) |

## Lições

- **O revisor acertou o sintoma e errou a causa (S5).** Só o teste, e depois a pilha do erro, mostrou que o problema
  era do framework e global, e não do DTO. Se eu tivesse corrigido só o DTO, como ele propôs, o teste do login
  continuaria vermelho.
- **O primeiro teste HTTP do S5 falhou por outro motivo (S11):** o corpo de 120 KB estourou o limite de tamanho, e esse
  erro também virava 500. Um teste que falha "pelo motivo errado" ainda é informação: ler o log com o id de correlação
  levou ao achado.
- **Antes de impor um limite, meça o legado (S6).** O legado quebra em 170 níveis e o novo aguenta mais de 1.000. O
  limite deixa de ser correção de segurança urgente e vira decisão de produto.
