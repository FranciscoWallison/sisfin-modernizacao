# Regras de negócio — módulo `site` (cadastro, login e convite) — AS-IS

> Levantadas em 25/09/2026. Fontes:
> - código: `legacy/app/Http/Controllers/Site/Auth/RegisterController.php`, `LoginController.php`,
>   `Site/SubscriptionsController.php` (convite), `Http/Requests/UserRegisterRequest.php`,
>   `Http/Middleware/AuthenticateFromToken.php` e `CheckSubscription.php`, `Repositories/UserRepositoryEloquent.php`,
>   `routes/web.php`;
> - views: `resources/views/site/**`; SPA: `components/Menu.vue`, `services/jwt-token.js`;
> - sondas reproduzíveis: `tools/sondas/site-legado.mjs`, `site-mensagens-legado.mjs`, `site-throttle-legado.mjs`.
>
> O site é **Blade + sessão + CSRF**, não API: o contrato é HTML e redirecionamento. Por isso a paridade HTTP do
> harness (JSON) não se aplica diretamente (ver cada regra); o aceite no sistema novo é por teste de integração e tela.

### RN-SIT-001 — Cadastro cria um CLIENTE novo e o primeiro usuário dele, já logado
- **Regra:**
  - `POST /register` com `name`, `email`, `password`, `password_confirmation`, `client[name]`, `client[email]`:
    - cria o cliente (o tenant);
    - cria o usuário ligado a ele: `role = client` (padrão da coluna), senha em **bcrypt**;
    - abre a sessão web;
    - redireciona para `/subscriptions/create` (assinatura, Iugu).
  - Sem transação: o cliente é gravado antes do usuário (`RegisterController::store`).
- **Evidência:** `RegisterController.php` (`clientRepository->create` → `userRepository->create` → `Auth::loginUsingId`);
  `UserRepositoryEloquent.php:19` (`bcrypt`)
- **Sonda:** `site-legado.mjs` passo 1 → 302 para `/subscriptions/create`; no banco, usuário com `role: client`, hash
  `$2y$10$…`, cliente com `code: null`; a área logada abre (200) ✅
- **Paridade:** n/a (o contrato muda de formulário HTML para API — ADR-009); aceite em S02/S04
- **Confiança:** alta · **Observação:** um erro entre as duas gravações deixaria um cliente sem usuário (não sondado)

### RN-SIT-002 — Validação do cadastro (mensagens do Laravel)
- **Regra:**
  - `name` required|max:255;
  - `email` required|email|max:255|**unique** em `users`;
  - `password` required|min:6|max:20|confirmed;
  - `client.name` required|max:255;
  - `client.email` required|max:255 — **sem** a regra `email`: aceita "nao-e-email".
  - Erro → volta ao formulário com as mensagens do Laravel em inglês (ex.: "The email has already been taken.",
    "The password must be at least 6 characters.", "The password may not be greater than 20 characters.",
    "The client.name field is required.").
  - Tentativa inválida não grava nada.
- **Evidência:** `legacy/app/Http/Requests/UserRegisterRequest.php`
- **Sonda:** `site-mensagens-legado.mjs` (5 cenários com as mensagens exatas); `site-legado.mjs` passos 1 e 3 (0 clientes
  criados pelas tentativas inválidas) ✅
- **Paridade:** n/a (ADR-009); aceite em S02
- **Confiança:** alta · **Suspeita de bug?** `client.email` sem validação de formato (DUV-SIT-002)

### RN-SIT-003 — O cadastro dá acesso à API sem assinatura
- **Regra:** o usuário recém-cadastrado obtém token em `POST /api/access_token` e usa a API normalmente. O middleware
  `check-subscription` está registrado (`Kernel.php:60`), mas **não é aplicado a nenhuma rota**.
- **Evidência:** `grep check-subscription` só acha o registro no `Kernel`; `CheckSubscription.php` nunca roda
- **Sonda:** `site-legado.mjs` passo 2 → token e `GET /api/bank_accounts` 200 (lista vazia) ✅
- **Paridade:** n/a (ADR-009); aceite em S02
- **Confiança:** alta · **Importa para:** o módulo `assinaturas` (a cobrança nunca foi exigida)

### RN-SIT-004 — Login do site: sessão, throttle de 5 tentativas / 60 s
- **Regra:**
  - `POST /login` (sessão web, `AuthenticatesUsers`) → 302 para `/`.
  - Erro → "These credentials do not match our records.".
  - Na **6ª** tentativa errada, e também com a senha **certa**: "Too many login attempts. Please try again in 60 seconds."
    (`ThrottlesLogins`, chave e-mail + IP).
- **Evidência:** `Site/Auth/LoginController.php` (`use AuthenticatesUsers`)
- **Sonda:** `site-throttle-legado.mjs` (mensagens da 1ª à 6ª tentativa); `site-logout-legado.mjs` (senha certa depois das erradas →
  volta ao login) ✅
- **Paridade:** n/a (ADR-009); aceite em S03. O sistema novo já tem login por `POST /api/access_token` com lockout e rate limit
  (RN-AUT-*, ADR-005)
- **Confiança:** alta

### RN-SIT-005 — Ponte SPA → site: o JWT vai NA URL e vira sessão
- **Regra:** o menu do SPA abre `/my-financial?token=<JWT>` (`Menu.vue:121`). O middleware `auth.from_token` aceita o
  JWT do guard da API e abre uma **sessão web** para o mesmo usuário; a sessão continua sem o token.
  `/my-financial` responde só "oi".
- **Evidência:** `AuthenticateFromToken.php`; `routes/web.php:68-74`
- **Sonda:** `site-legado.mjs` passo 6 → `GET /my-financial?token=…` 200 "oi"; depois `/my-financial/invite` 200 sem
  token ✅
- **Paridade:** n/a (ADR-009); aceite em S05
- **Confiança:** alta · **Suspeita de bug?** **sim, de segurança:** token em URL vaza para logs, histórico e `Referer`
  (DUV-SIT-003)

### RN-SIT-006 — O "convite" NUNCA funcionou: todo POST dá 500
- **Regra:**
  - A intenção (pelo nome) era convidar alguém. O código faria o mesmo que o cadastro: um **cliente novo**, e não um
    usuário no cliente de quem convida.
  - Mas não chega a rodar: `SubscriptionsController` usa `UserRegisterRequest` sem `use` (a classe é resolvida em
    `Site\UserRegisterRequest`, que não existe) e nem recebe os repositórios de cliente e usuário.
- **Evidência:**
  - `laravel.log`: `ReflectionException: Class SisFin\Http\Controllers\Site\UserRegisterRequest does not exist`;
  - `SubscriptionsController.php:27` (o construtor só recebe `PlanRepository` e `IuguSubscriptionManager`).
- **Sonda:** `site-legado.mjs` passo 6 → `POST /my-financial/invite` 500; nenhum usuário criado ✅
- **Paridade:** n/a (funcionalidade inexistente na prática — DUV-SIT-001); tratamento no novo: S05
- **Confiança:** alta

### RN-SIT-007 — Logout do site encerra a sessão
- **Regra:** `POST /logout` → apaga e regenera a sessão → 302 para `URL_SITE_LOGIN` (`/login`); a área logada volta a
  pedir login.
- **Sonda:** `site-logout-legado.mjs` → logout 302 `/login`; `/subscriptions/create` depois → 302 `/login` ✅
- **Paridade:** n/a (ADR-009); no sistema novo é o `POST /api/logout` (blacklist do token, RN-AUT-003); aceite em S03
- **Confiança:** alta

### RN-SIT-008 — Formulários exigem CSRF; sem ele → 500
- **Regra:** todo POST do site exige `_token`. No Laravel 5.3, o `TokenMismatchException` vira **500**, e não 419.
- **Sonda:** `site-legado.mjs` passo 4 → 500 ✅
- **Paridade:** n/a (o sistema novo usa JWT em cabeçalho, sem cookie de sessão — ADR-009); aceite em S06
- **Confiança:** alta

### RN-SIT-009 — E-mail sem diferenciar maiúsculas (cadastro e login)
- **Regra:** a collation `utf8_unicode_ci` do MySQL compara texto sem diferenciar maiúsculas:
  - o `unique:users` do cadastro recusa `CLIENTE1@USER.COM` quando existe `cliente1@user.com`;
  - o login da API (`/api/access_token`) aceita o e-mail em qualquer capitalização.
- **Evidência:** collation das tabelas (`SHOW TABLE STATUS`: `utf8_unicode_ci`); regra `unique:users`; `JWTAuth::attempt` → `where email = ?`
- **Sonda:** `tools/sondas/site-email-maiusculas-legado.mjs` → cadastro "The email has already been taken."; login do
  legado **200** ✅. **O sistema novo responde 400** no mesmo login (o Postgres diferencia maiúsculas; achado ao
  implementar a S02, que corrige o `auth-compat` já migrado).
- **Paridade:** n/a (o cadastro muda de HTML para API — ADR-009); aceite em S02
- **Confiança:** alta
