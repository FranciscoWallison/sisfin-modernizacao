# Revisão de segurança — módulo `admin-bancos` (A06) · 26/09/2026

> Revisor: agente independente, só leitura, com sondas HTTP na stack local (bancos de teste criados e excluídos; os
> bancos 1–3 do seed intactos). Escopo: `api/src/modules/admin-bancos/**`, config e Dockerfile da API, nginx e compose
> (volume de arquivos), `tools/migrar-logos.mjs` e as telas `web/src/paginas/admin/`.
>
> Regra do projeto: cada achado real vira um teste que **falha antes** da correção. Todos os testes abaixo foram vistos
> vermelhos e, depois da correção, conferidos por **mutação** (desfazer só a correção → o teste volta a falhar).

| # | Severidade | Achado | Situação |
|---|---|---|---|
| S1 | média | XSS armazenado pelo nome do banco no app antigo | ✅ corrigido |
| S2 | baixa | `migrar-logos` copiava qualquer conteúdo e seguia link simbólico | ✅ corrigido |
| S3 | baixa | Arquivo órfão quando dois bancos com o mesmo logo trocam ao mesmo tempo | ✅ corrigido (caso b); caso a aceito |
| S4 | baixa | Erro do upload ecoava o nome do campo enviado | ✅ corrigido |
| S5 | info | `docker cp` gravava os logos como root, modo 0755 | ✅ corrigido |
| S6 | info | PNG "poliglota" (cabeçalho PNG + `<script>`) é aceito | aceito (contido) |
| S7 | info | PUT em id inexistente com logo inválido → 422, não 404 | aceito |

## S1 — XSS armazenado pelo nome do banco (média)

- **Onde:** o autocomplete do app antigo (Vue 1, em `/app`) monta `<li data-text="<%= item.text %>">…<%= item.text %>`
  **sem escapar** e injeta com `.html()`. `item.text` é o `name` do banco (`store/bank.js`, `mapBanks`), mostrado a
  **todos os clientes** nas telas de conta bancária. O `/app` não tem CSP (pendência conhecida: o Vue 1 usa `eval`) e
  divide a origem — e o `localStorage` com o token — com o site novo.
- **Demonstrado:** `POST /api/admin/banks name=<img src=x onerror=alert(localStorage.token)>` → 201, e o nome voltava
  cru no `GET /api/banks` do cliente. O disparo no navegador não foi reproduzido (o dropdown não abriu no Playwright).
- **Contexto:** exige ser admin, e o legado tinha o mesmo defeito (só nunca se exercitou, porque criar banco sempre deu
  500 — RN-ADB-003). Mas é um admin de bancos tomando a sessão de clientes.
- **Correção:** `legacy/` não é editado. A barreira fica na **única porta de escrita** do nome: o DTO recusa
  `< > " '` (sem eles não há como sair do texto nem do atributo) com 422
  `{"name":["The name may not contain the characters < > \" '."]}`. `&` e acentos continuam valendo.
- **Teste:** `admin-bancos.integracao.spec.ts` › "S1…" (3 variantes: tag, aspas duplas, aspas simples, no POST e no
  PUT) + "nome comum com & e acentos". Mutação (sem o `@Matches`): 3 falham.
- **Resíduo:** nomes que já venham do legado no ETL não passam pelo DTO. No seed são limpos; num cutover real, o ETL
  deve relatar nomes de banco com esses caracteres (pendência registrada).

## S2 — `migrar-logos` sem conferir conteúdo (baixa)

- **Achado:** `nomeSeguro` só validava o formato do nome. Um logo do legado `x.html` (ou `.svg`) com HTML iria para o
  volume, e o nginx o serviria como `text/html` na origem do app. Contido por `CSP: default-src 'none'; sandbox` e
  `nosniff`, mas contrariava o ADR-010 ("o volume só recebe PNG/JPEG/WebP validados"). E `existsSync`/`copyFileSync`
  seguem link simbólico.
- **Correção:** extensão `png/jpg/jpeg/webp` + assinatura do conteúdo (a mesma regra de `detectarImagem()` da API);
  `lstat` e só arquivo regular; copia o **conteúdo lido e conferido** (`wx`), não o caminho.
- **Teste:** `tools/testes/migrar-logos.test.mjs` › "S2: recusa extensão… e conteúdo…" e "S2: recusa link simbólico".
  O do link é pulado no Windows (sem privilégio para criar link) e roda na CI (Linux); conferido num contêiner
  `node:22-alpine`: 4/4, e com a mutação "seguir o link" o teste falha.

## S3 — arquivo órfão com logo compartilhado (baixa)

- **(b) Demonstrado pelo teste:** dois bancos migrados apontando para o mesmo arquivo trocam de logo ao mesmo tempo.
  Cada transação trava só a própria linha; em READ COMMITTED, cada uma via a outra ainda usando o arquivo, e **nenhuma**
  o removia.
- **Correção:** `pg_advisory_xact_lock(logoDeBanco, hashtext(logo))` antes de gravar e decidir a remoção (troca e
  exclusão). A segunda transação espera a primeira e, ao seguir, já vê a troca gravada. Chave nova no registro único
  (`CHAVES_ADVISORY_LOCK.logoDeBanco = 4`).
- **Teste:** "S3: dois bancos com o MESMO logo trocam de logo ao mesmo tempo" (5 rodadas). Mutação (sem a trava): falha.
- **(a) Aceito:** se o processo cair entre gravar o arquivo e o commit, o arquivo novo fica sem dono. Nunca apaga nada
  referenciado; o custo é espaço. Uma varredura de reconciliação (arquivos − `banks.logo`) fica como melhoria.

## S4 — erro do upload ecoava o nome do campo (baixa)

- **Demonstrado:** arquivo no campo `fo<b>o` → `400 {"message":"Unexpected file field - fo<b>o"}` (mensagem do
  `transformException` do Nest). JSON, então não executa, mas é reflexo de entrada.
- **Correção:** o filtro das rotas com upload (`ErrosDoUploadFilter`, antes `LogoGrandeFilter`) também trata os 400 do
  multer com mensagem **fixa** `{"message":"Bad Request"}`.
- **Teste:** "S4: erro do upload não ecoa o nome do campo enviado". Mutação (filtro só com o 413): falha.

## S5 — dono e modo dos arquivos copiados (info)

- `docker cp` grava como `root:root 0755`. O diretório é do `node`, então a API ainda conseguia apagar e o nginx ler,
  mas ficava inconsistente. **Correção:** depois da cópia, `chown node:node` + `chmod 644` (como root, só nos nomes
  copiados, já validados). Conferido numa execução real contra o volume: `-rw-r--r-- node node`.

## S6 e S7 — aceitos

- **S6:** um PNG com `<script>` depois do cabeçalho é aceito e servido como `image/png`, com `nosniff` e
  `CSP sandbox`: não executa. É o comportamento previsto no design. Recodificar a imagem (ex.: `sharp`) seria um
  endurecimento extra, com uma dependência nativa — não agora.
- **S7:** a validação do logo vem antes da busca do banco; não vaza nada.

## Conferido e OK (resumo do revisor)

- 401 sem token; 403 para cliente em todas as rotas, **antes** de o multer ler o corpo (1,1 MB → 403 em 9 ms); o papel
  vem do banco a cada requisição.
- Limites do upload: > 1 MB → 422; 2 arquivos, campos demais, `name` > 4096 bytes, multipart malformado → 400; `logo`
  como texto ou em JSON → 422; memória limitada a 1 MB por requisição.
- Tipo só pelos bytes; extensão do tipo detectado (`x.svg` com `image/svg+xml` virou `.png`); nome aleatório de 16
  bytes; `wx`; 0644 com dono `node`.
- Remoção: `logoRemovivel` barra `/`, `..`, nome com ponto inicial e o `default.jpg`; o nome vem do banco, nunca do
  cliente.
- Concorrência: 5 PUTs simultâneos no mesmo banco → 1 arquivo; PUT + DELETE simultâneos → volume vazio; FK violada
  entre a checagem e o DELETE → 422.
- SQL cru só com template parametrizado e `lock_timeout` de 3 s.
- nginx: `^~`; o diretório não lista (cai na imagem padrão); `../`, `%2e%2e`, `%2f` normalizados e sem servir nada fora
  do volume; imagem padrão com `image/svg+xml`, CSP sandbox e `nosniff`; volume só leitura.
- Front novo: nome e logo escapados pelo Vue; `confirm()` só com texto; token no cabeçalho; `acessoAdmin` é só
  experiência (a API responde 403); rota `:id(\d+)`.
