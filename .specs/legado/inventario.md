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
| contas | `Api\BillPaysController`, `Api\BillReceivesController`, `BillControllerTrait` | `.specs/legado/modulos/contas/` | 🟡 regras iniciais |
| categorias | `Api\CategoryExpensesController`, `Api\CategoryRevenuesController` | — | ⚪ |
| contas-bancarias | `Api\BankAccountsController` | — | ⚪ |
| bancos | `Admin\BanksController`, `Api\BanksController` | — | ⚪ |
| extrato | `Api\StatementsController` | — | ⚪ |
| fluxo-de-caixa | `Api\CashFlowsController` | — | ⚪ |
| assinaturas | `Site\SubscriptionsController`, `Api\IuguController`, `app/Iugu/*` | — | ⚪ |
| auth | `Api\AuthController`, `Auth\*`, `Site\Auth\*`, `app/Jwt` | — | ⚪ |

## Achados de outros módulos (para quando forem migrados)

| Módulo | Achado | Evidência |
|---|---|---|
| categorias | A criação de categoria **desliga o filtro de tenant** durante a operação (`$model::$enableTenant = false`) para montar o nested set; investigar se filho pode ser criado sob pai de outro cliente | `legacy/app/Repositories/Traits/CategoryRepositoryTrait.php` (`create`) |

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
