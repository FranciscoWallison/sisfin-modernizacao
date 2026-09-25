Status: aprovado — Francisco, 25/09/2026 (com o plano, hash af43e2de4789). Mudanças posteriores no fim do arquivo.

# Design — módulo `site` (cadastro e login) — TO-BE

> Implementa `requirements.md` (REQ-SIT-01..07). Contrato novo (API + tela) conforme o ADR-009 (aceito).

## 1. API (`api/src/modules/cadastro/`)

```text
http/
  cadastro.dto.ts        name, email, password, password_confirmation, client: { name, email } — mensagens do Laravel
  cadastro.controller.ts POST /api/register — PÚBLICA (sem @ComCliente), com o rate limit das rotas de autenticação
application/
  cadastro.service.ts    transação: cliente → usuário (bcrypt, role client) → emite o JWT pelo mesmo emissor do access_token
infra/
  cadastro.repositorio.ts   Client e User NÃO têm tenant (são a raiz dele): acesso pelo PrismaService puro — exceção
                            explícita à regra "infra usa PRISMA_TENANT", registrada no .dependency-cruiser (só este arquivo)
```

- **`password_confirmation`:** validador `IgualA('password')` com a mensagem do Laravel ("The password confirmation does
  not match.").
- **Aninhado:** `client` com `@ValidateNested` + `@Type`. As mensagens saem como `client.name` / `client.email`, como no
  Laravel (o `errosNoFormatoLaravel` já monta o prefixo).
- **Rate limit:** a rota entra no mesmo limite de requisições do `access_token` (auth-compat), porque cadastro público
  é alvo de abuso.
- **Emissão do token:** reutiliza `tokens.ts` (mesmo `iss`, expiração e `jti` do login), sem duplicar a lógica.
- **Unicidade do e-mail:**
  - checagem antes (422 com a mensagem do Laravel);
  - o índice único de `users.email`, que já existe, como segunda barreira (P2002 → a mesma 422).

## 2. Front novo (`web/`, Vue 3 + Vite + TypeScript)

```text
web/
  index.html
  src/main.ts, src/App.vue, src/rotas.ts        rotas: / (início), /login, /register, /my-financial, * (não encontrada)
  src/api.ts        fetch para a API (URL do build, como o SPA); erros 422 → mapa campo → mensagens
  src/sessao.ts     localStorage['token'] (a MESMA chave do SPA: services/jwt-token.js); entrar → /app
  src/paginas/*.vue
  test/*.spec.ts    vitest: api.ts (422 → campos), sessao.ts, remoção do ?token=
```

- **Sem biblioteca de UI.** CSS mínimo com as cores do rótulo da versão nova. O objetivo é função e contrato, não layout.
- **Tokens nunca em URL.** Em `/my-financial`, `history.replaceState` remove o `?token=` antes de qualquer outra coisa;
  o parâmetro nunca é lido.

## 3. Servir (Docker)

- `docker/spa/Dockerfile` ganha:
  - o estágio `web-build` (node:22, `npm ci && vite build`);
  - o estágio `servidor-novo` (FROM `servidor` + a build do web + `nginx-novo.conf`).
- O compose aponta o `spa-novo` para `target: servidor-novo`; o `spa-antigo` fica igual.
- **`nginx-novo.conf`:**
  - `/app` como hoje;
  - o resto → `web/index.html` (history mode);
  - `add_header Referrer-Policy no-referrer`;
  - `location /my-financial` com `access_log` num formato **sem** `$args`.

## 4. Testes

| Nível | O quê |
|---|---|
| Unitário (api) | DTO: as 9 mensagens do contrato (sondas), `client.email` com formato, confirmação |
| Integração (api) | Transação (falha no usuário → nenhum cliente); corrida de e-mail (201 + 422); token do cadastro serve para `/api/user`; usuário novo vê listas vazias e nada de outro cliente; `?token=` na query → 401; rate limit do cadastro |
| Unitário (web) | vitest: mapa de erros 422, sessão, remoção do `?token=` |
| Tela | Playwright em :8083: cadastro → `/app` logado (dashboard carrega); login errado mostra a mensagem; `/my-financial?token=…` termina sem `token=` na URL; sair; `/my-financial/invite` → "não encontrada" |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| `cadastro.repositorio` usar o Prisma sem tenant | Exceção só para esse arquivo no depcruise, com comentário; o repositório só cria (não lê dados de clientes) |
| Cadastro público virar vetor de abuso | Rate limit das rotas de autenticação; o e-mail não é confirmado (como no legado) — registrar como pendência de produto |
| Front novo sem layout "bonito" | Fora do escopo da migração; a função e o contrato são o aceite |

## Mudanças após a aprovação

| Data | Mudança | Motivo |
|---|---|---|
| 25/09/2026 | E-mail **sem diferenciar maiúsculas**: unicidade no cadastro (`mode: 'insensitive'`), login do `auth-compat` e índice único `lower(email)` (migration manual) | RN-SIT-009, achada ao implementar a S02: o legado (MySQL `utf8_unicode_ci`) aceita `CLIENTE1@USER.COM` no login; o novo respondia 400. Mutação: sem o índice, a corrida de dois cadastros com capitalização diferente passa os dois (3/3) |
| 25/09/2026 | O aceite de tela é um **E2E versionado** (`web/e2e/`, `@playwright/test`, Chrome instalado, headless, perfil limpo), rodado localmente e na CI, em vez de só o Playwright MCP | O Chrome de perfil persistente do MCP travou a entrada num diálogo nativo (gerenciador de senhas) depois do 1º cadastro. Um E2E com perfil limpo é reproduzível e vira sensor |
| 25/09/2026 | `@playwright/test` **1.63** | O 1.52 trava ao carregar a config num pacote ESM com Node 24 (até o `--list` travava) |
| 25/09/2026 | Depois do login/cadastro, a tela vai para `/app#!/dashboard` | É o destino do login do próprio app (`Login.vue` → `$router.go({ name: 'dashboard' })`); `/app` sozinho parava em `#!/` sem carregar o dashboard |
| 25/09/2026 | O log de `/my-financial` registra `$caminho` (o `$uri` antes do `try_files`) | Com `$uri`, o log mostrava `/web/index.html`. Nos dois casos, a query com o token não entra no log |
| 25/09/2026 | O E2E tem `globalSetup` que espera `/health` e o site | Logo depois de um `compose up --build`, o 1º teste pegava a API ainda subindo |
| 25/09/2026 | Revisão de segurança (S06): igualdade por `lower(email) = lower($1)` em vez de `mode: 'insensitive'` (**ILIKE sem escape — login com `%` entrava**); sensor contra a volta do padrão; e-mail do login ≤ 255 e sem NUL; varredura dos mapas em memória; limite próprio do cadastro (`CADASTROS_POR_HORA`); CSP e cabeçalhos no nginx (config vira template com `API_ORIGEM`); log sem query no servidor inteiro | `docs/revisoes/2026-09-25-security-site.md` — cada achado com teste vermelho antes |
