Status: aprovado — Francisco, 26/09/2026 (com o plano, hash bb0f9a303b2e). Mudanças posteriores no fim do arquivo.

# Design — módulo `admin-bancos` — TO-BE

> Implementa `requirements.md` (REQ-ADB-01..07). Decisões: ADR-010 (aceito). Segue o caminho do ADR-009 (API +
> `web/`, login único por JWT).

## 1. API (`api/src/modules/admin-bancos/`)

```text
domain/
  imagem.ts            detecta PNG/JPEG/WebP pela assinatura (bytes iniciais); tamanho; extensão pelo tipo  (puro)
infra/
  bancos.repositorio.ts   Bank (sem tenant — lista global) via PRISMA_TENANT; contagem de bank_accounts por banco
  arquivos.ts             grava/remove em ARQUIVOS_DIR/banks/imagens; nome aleatório (crypto); nunca sobrescreve
application/
  admin-bancos.service.ts criar/editar/excluir: arquivo novo → banco (transação) → remove o antigo; falha → remove o novo
http/
  somente-admin.guard.ts  JwtAuthGuard + role === 'admin' (403)
  admin-bancos.controller.ts  GET/POST/PUT/DELETE /api/admin/banks — multipart (FileInterceptor, limite 1 MB)
```

- **Bank não tem tenant.** O acesso passa pelo `PRISMA_TENANT`, que deixa modelos sem cliente passarem, como o
  `GET /api/banks` já faz. A proteção é o `SomenteAdminGuard`. A contagem de contas bancárias em uso é **global**
  (qualquer cliente), por isso vai em SQL cru; o sensor de SQL cru ganha a exceção documentada, só para
  `bank_accounts` por `bank_id`, sem retornar dados de cliente.
- **Upload:** `@nestjs/platform-express` com `FileInterceptor('logo', { limits: { fileSize: 1 MB + 1 } })` em
  memória. O `imagem.ts` decide pelo conteúdo:
  - PNG: `89 50 4E 47 0D 0A 1A 0A`;
  - JPEG: `FF D8 FF`;
  - WebP: `RIFF….WEBP`.
- **Arquivos:** `ARQUIVOS_DIR` na config validada (padrão `/data/arquivos`). A escrita usa `flag: 'wx'`, que falha se
  o arquivo existir, e nunca sobrescreve. O nome é `randomBytes(16).hex + .png|.jpg|.webp`.
- **Ordem na edição:** grava o arquivo novo → atualiza o banco → remove o antigo (se não for `default.jpg`). Se o
  banco falhar, remove o novo.
- **Erros:** 422 no formato do Laravel. Arquivo grande (limite do multer) → o mesmo 422 do tipo, e não 413 genérico.

## 2. Servir e migrar

- **Compose:** volume `arquivos`, montado na `api` (`/data/arquivos`, leitura e escrita) e no `spa-novo`
  (`/srv/arquivos`, só leitura). `ASSETS_URL: http://localhost:8083`.
- **nginx-novo:** `location /storage/ { alias /srv/arquivos/; try_files $uri /web/banco-padrao.svg; }` com
  `X-Content-Type-Options: nosniff` (o snippet de segurança). Também `default_type` seguro: o volume só recebe os três
  tipos de imagem.
- **`web/public/banco-padrao.svg`:** a imagem padrão, que substitui a imagem quebrada.
- **`tools/migrar-logos.mjs --origem <dir>`:** lê `banks.logo` no MySQL e copia para o volume (via `docker compose cp`
  para o container da API) os arquivos existentes na origem. Relata os ausentes (no seed, os 3). Idempotente.
- **Espelho:** normaliza também `http://localhost:8083` → `<base>`.

## 3. Telas (`web/`)

- **Rotas:** `/admin/banks`, `/admin/banks/novo`, `/admin/banks/:id`. Um guard do roteador lê o usuário do
  `localStorage` (`role`); a API é quem de fato protege.
- **Lista** com logo (`<img>`, mesma origem, dentro da CSP `img-src 'self'`), paginação de 5 e excluir com
  confirmação. O 422 "Bank has bank accounts." aparece na tela.
- **Formulário:** nome + arquivo (`accept="image/png,image/jpeg,image/webp"`) e prévia do logo atual. Envio multipart
  com `fetch` e `FormData`.
- **"Minha conta":** link "Administração de bancos" quando `role === 'admin'`.

## 4. Testes

| Nível | O quê |
|---|---|
| Unitário (api) | `imagem.ts`: PNG/JPEG/WebP reais; texto com extensão `.png`; vazio; SVG (recusado: pode ter script) |
| Integração (api) | 401/403 em todas as rotas, sem gravar; criar/editar/excluir com arquivo no diretório (temp); troca apaga o antigo; `default.jpg` intocado; falha no banco não deixa arquivo; em uso → 422; paginação |
| Ferramenta | `migrar-logos`: copia os existentes, relata os ausentes, idempotente |
| Tela | E2E: fluxo completo do admin com um PNG; cliente comum sem acesso; `/admin/register` e `/admin/password/reset` → não encontrada |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Upload virar vetor (arquivo malicioso servido na origem do app) | Só 3 tipos por assinatura; SVG recusado; nome gerado; `nosniff`; CSP; volume só-leitura no nginx |
| Arquivo órfão no volume | Ordem arquivo → banco → remoção do antigo; falha remove o novo; teste |
| Logos antigos ausentes no cutover | `migrar-logos` relata; a imagem padrão cobre a tela |

## Mudanças após a aprovação (implementação, 26/09/2026)

| Mudança | Por quê |
|---|---|
| `GET /api/admin/banks/:id` (só admin) | A tela de edição precisa do banco; a lista paginada não serve para abrir um id direto (A05) |
| nginx com `root /srv` e o volume montado em `/srv/storage` (em vez de `alias`) + `@logo_padrao` | `try_files` com `alias` tem armadilhas conhecidas; a imagem padrão sai do build do `web/` (`/usr/share/nginx/html/web/banco-padrao.svg`), não de uma URL que cairia no SPA |
| CSP `default-src 'none'; sandbox` nas respostas de `/storage/banks/imagens/` | Um arquivo aberto direto na aba não executa nada, mesmo que algo inesperado chegue ao volume |
| Trava da linha do banco (`FOR UPDATE`) na edição e na exclusão | Duas edições do mesmo banco não removem o logo uma da outra |
| `name` recusa `< > " '` (422) | Revisão de segurança S1: o app antigo interpola o nome em HTML sem escapar |
| `pg_advisory_xact_lock(logoDeBanco, hashtext(logo))` antes de decidir remover um logo | Revisão de segurança S3: bancos diferentes com o mesmo arquivo |
| Erros 400 do multer com mensagem fixa | Revisão de segurança S4 |
| `migrar-logos` confere extensão e assinatura, recusa link simbólico e corrige dono/modo | Revisão de segurança S2 e S5 |
| API roda como `node` (não root) | O volume nasce com o dono certo; hardening |
