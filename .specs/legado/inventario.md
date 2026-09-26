# Inventário do legado (SisFin — Laravel 5.3.18)

> Rascunho inicial (24/09/2026). Completar com o `arqueologo`.

## Superfícies

| Superfície | Onde | Autenticação |
|---|---|---|
| API REST (usada pelo SPA) | `legacy/routes/api.php` | JWT (`tymon/jwt-auth`), `POST /api/access_token`, `/api/refresh_token` |
| SPA do cliente ("my-financial") | `legacy/resources/assets/spa/` (Vue 1) | Token |
| Admin (bancos) | `legacy/routes/web.php` prefixo `admin` | Sessão + gate `access-admin` |
| Site (cadastro, login, assinatura) | `legacy/routes/web.php` prefixo `/` | Sessão |
| Webhook Iugu | `POST /api/hooks/iugu` | ⚠️ nenhuma |

## Módulos

| Módulo | Controllers | Regras em | Status |
|---|---|---|---|
| contas | `Api\BillPaysController`, `Api\BillReceivesController`, `BillControllerTrait` | `.specs/legado/modulos/contas/` | ✅ migrado (`api/src/modules/contas`) |
| categorias | `Api\CategoryExpensesController`, `Api\CategoryRevenuesController` | `.specs/legado/modulos/categorias/` | ✅ migrado (`api/src/modules/categorias`) |
| contas-bancarias | `Api\BankAccountsController` | `.specs/legado/modulos/contas-bancarias/` | ✅ escrita migrada (`api/src/modules/contas-bancarias`); leitura no compat |
| bancos | `Admin\BanksController`, `Api\BanksController` | `Api`: em `contas-bancarias` (RN-CBA-007); `Admin`: `.specs/legado/modulos/admin-bancos/` | ✅ `GET /api/banks` migrado; ✅ admin migrado (`api/src/modules/admin-bancos` + `web/`, ADR-010) |
| extrato | `Api\StatementsController` | `.specs/legado/modulos/extrato/` | ✅ migrado (`api/src/modules/extrato`) |
| fluxo-de-caixa | `Api\CashFlowsController` | `.specs/legado/modulos/fluxo-de-caixa/` | ✅ migrado (`api/src/modules/fluxo-de-caixa`) |
| assinaturas | `Site\SubscriptionsController`, `Api\IuguController`, `app/Iugu/*` | — | ⚪ |
| auth | `Api\AuthController`, `Auth\*`, `app/Jwt` | RN-AUT-* (em `contas`) | ✅ API de login/refresh/logout migrada (auth-compat, ADR-005) |
| site (cadastro, login, convite) | `Site\Auth\*`, `Site\SubscriptionsController@invite*`, middleware `auth.from_token` | `.specs/legado/modulos/site/` | ✅ migrado: `POST /api/register` (`api/src/modules/cadastro`) + telas Vue 3 (`web/`); convite não migrado (ADR-009) |

## Achados de outros módulos (para quando forem migrados)

| Módulo | Achado | Evidência |
|---|---|---|
| categorias | ~~A criação de categoria desliga o filtro de tenant; investigar~~ → **investigado (25/09):** a criação é protegida pela validação do `parent_id`; a **edição** não é — IDOR confirmado (RN-CAT-003) | `.specs/legado/modulos/categorias/regras.md` |

## Eventos → listeners (`legacy/app/Providers/EventServiceProvider.php:25-41`)

| Evento | Listener | Efeito |
|---|---|---|
| `BankStoredEvent` | `BankLogoUploadListener` | Upload do logo do banco |
| `RepositoryEntityCreated` / `Updated` | `BankAccountSetDefaultListener` | Garante uma conta bancária padrão |
| `BillStoredEvent` | `BankAccountUpdateBalanceListener` | Saldo + extrato (RN-CON-003..007) |
| `IuguSubscriptionCreatedEvent` | `SubscriptionCreateListener` | Cria assinatura |

## Jobs agendados

Nenhum (`legacy/app/Console/Kernel.php` só tem o exemplo comentado).

## Integrações externas

Iugu (pagamentos/assinaturas), Pusher (broadcast), SMTP (e-mail), Heroku (deploy — morto).
