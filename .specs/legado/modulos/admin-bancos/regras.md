# Regras de negócio — módulo `admin-bancos` (AS-IS)

> Levantadas em 26/09/2026. Fontes:
> - código: `legacy/app/Http/Controllers/Admin/BanksController.php`, `Repositories/BankRepositoryEloquent.php`,
>   `Listeners/BankLogoUploadListener.php`, `Models/Bank.php`, `Providers/AuthServiceProvider.php` (gate
>   `access-admin`), `routes/web.php:35-47`;
> - views `resources/views/Admin/banks/*`;
> - sondas reproduzíveis: `tools/sondas/admin-bancos-legado.mjs` e `admin-auth-legado.mjs` (usuário `admin@user.com`,
>   `role = admin`).
>
> Como o site, é **Blade + sessão + CSRF**: a paridade HTTP (JSON) não se aplica, e o aceite no novo é por integração e
> E2E (ver cada regra).

### RN-ADB-001 — Em Linux, TODO o admin de bancos dá 500 (views em `Admin/`, código chama `admin.`)
- **Regra:**
  - O diretório versionado é `resources/views/Admin/banks` (A maiúsculo), mas o controller chama
    `view('admin.banks.index')`.
  - Num sistema de arquivos que não diferencia maiúsculas (Windows/macOS, onde o autor desenvolvia), funciona. Num
    servidor Linux, o comum em produção, a listagem, a criação e a edição dão **500** ("View [admin.banks.index] not
    found").
- **Evidência:** `git ls-files resources/views` → `resources/views/Admin/banks/*.blade.php`; `laravel.log`
- **Sonda:** antes do ajuste de ambiente, `admin-bancos-legado.mjs` → `GET /admin/banks` 500 ✅.
- **Ambiente do oráculo:** para sondar a regra de negócio pretendida, a imagem do oráculo ganhou o link
  `resources/views/admin → Admin` (`docker/legacy/Dockerfile`), que emula o ambiente do autor sem tocar em `legacy/`.
  As regras seguintes valem **com** esse link.
- **Paridade:** n/a (HTML → API + tela nova, ADR-010); aceite em A05
- **Confiança:** alta

### RN-ADB-002 — Acesso: só `role = admin`; listagem de 5 por página, em ordem de id
- **Regra:**
  - Rotas sob `/admin` com o gate `access-admin` (`$user->role == 'admin'`). Sem login → 302 para `/admin/login`;
    usuário comum logado → 403.
  - `GET /admin/banks` lista 5 bancos por página (`paginate(5)`), com o logo em `storage/banks/imagens/<arquivo>`.
- **Evidência:** `AuthServiceProvider.php:30-32`; `BanksController::index`; `Admin/banks/index.blade.php:27`
- **Sonda:** `admin-bancos-legado.mjs` passos 1–2 (sem login → login; admin → 200, 5 bancos na 1ª página e link para a
  2ª) e `admin-auth-legado.mjs` (usuário comum → `/admin/home` 403) ✅
- **Paridade:** n/a (ADR-010); aceite em A02/A05
- **Confiança:** alta

### RN-ADB-003 — Criar e editar banco NUNCA funcionaram: sempre 500
- **Regra:**
  - `POST /admin/banks` e `PUT /admin/banks/{id}` usam `BankCreateRequest` e `BankUpdateRequest`, classes que **não
    existem** no código. Os bancos do sistema vêm só do seeder.
  - **Intenção** (pelo código que não chega a rodar):
    - `name` e `logo` (upload);
    - ao criar, o logo começa como `BANK_LOGO_DEFAULT` (`default.jpg`) e o arquivo enviado é salvo como
      `md5(time + nome original).extensão` em `storage/app/public/banks/imagens`;
    - ao editar, o upload **sobrescreve o arquivo de nome atual** (`$bank->logo`). Num banco ainda com `default.jpg`,
      isso trocaria o logo padrão de **todos** os bancos (bug latente);
    - não há validação de tipo nem de tamanho do arquivo.
- **Evidência:** `laravel.log`: `ReflectionException: Class SisFin\Http\Requests\BankCreateRequest does not exist` (e
  `BankUpdateRequest`); `BankRepositoryEloquent::create/update`; `BankLogoUploadListener::handle`
- **Sonda:** `admin-bancos-legado.mjs` passos 3–4 → 500 e nada gravado ✅
- **Paridade:** n/a (funcionalidade inexistente na prática — DUV-ADB-001); aceite em A03
- **Confiança:** alta

### RN-ADB-004 — Excluir: banco sem uso → apagado; banco com contas bancárias → 500
- **Regra:** `DELETE /admin/banks/{id}` → 302 para a listagem se nenhuma conta bancária usa o banco; se usa, a FK
  estoura → **500** e nada é apagado.
- **Sonda:** `admin-bancos-legado.mjs` passo 5 (banco 1, em uso → 500, continua; banco criado para a sonda, sem uso →
  302, some) ✅
- **Paridade:** n/a (ADR-010); aceite em A03
- **Confiança:** alta · **Suspeita de bug?** 500 em vez de 422 (DUV-ADB-004)

### RN-ADB-005 — `/admin/register` é PÚBLICO e cria usuários SEM cliente
- **Regra:** o `Auth::routes()` dentro do prefixo `/admin` registra cadastro e recuperação de senha.
  `POST /admin/register` (nome, e-mail, senha) cria um usuário com `role = client` e **`client_id = null`**. Ele não
  entra no admin (403), e na API legada todo endpoint dá 500 (RN-CON-019).
- **Evidência:** `routes/web.php:39` (`Auth::routes()` no grupo `admin`)
- **Sonda:** `admin-auth-legado.mjs` → 302 e usuário `{"role":"client","client_id":null}`; `/admin/home` 403 ✅
- **Paridade:** n/a (DUV-ADB-005); aceite em A05
- **Confiança:** alta · **Suspeita de bug?** sim: fábrica de usuários órfãos

### RN-ADB-006 — Recuperação de senha: o e-mail sai, mas o link dá 404
- **Regra:**
  - `/admin/password/email` envia o e-mail de recuperação para qualquer usuário, mas o link vai **sem** o prefixo:
    `/password/reset/<token>` → **404**. O fluxo só se completa se a pessoa acrescentar `/admin` à mão.
  - O link "Esqueceu-se da password?" da tela de login do admin também aponta para `/password/reset` (404).
  - O site e o app não têm recuperação.
- **Evidência:** `resources/views/auth/login.blade.php:38`; rotas `admin/password/*`
- **Sonda:** `admin-auth-legado.mjs` → e-mail enviado; link do e-mail 404; com `/admin` acrescentado, 200 ✅
- **Paridade:** n/a (DUV-ADB-006); aceite em A05
- **Confiança:** alta

### RN-ADB-007 — Arquivos de logo: storage do legado, servidos em `/storage`
- **Regra:** os logos ficam em `storage/app/public/banks/imagens`, publicados via `storage:link` em
  `public/storage/banks/imagens`. O `GET /api/banks` monta a URL (RN-CBA-007).
- **Ambiente:** no oráculo, os arquivos **não existem**: o seed grava só o nome, e o `storage:link` nunca rodou. A
  imagem sai quebrada nas duas versões (já registrado no design de `contas-bancarias`).
- **Paridade:** n/a (arquivos, não API); tratamento no novo: A04
- **Confiança:** alta
