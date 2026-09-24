# Comportamento — módulo `contas` (AS-IS)

> Rascunho inicial. Completar com `/mapear-modulo contas`.

## Endpoints (todos sob `auth:api` + tenant)

| Método | Rota | Controller | Observação |
|---|---|---|---|
| GET | `/api/bill_pays` | `Api\BillPaysController@index` | Paginado; devolve `bills` + `bill_data` (`total_paid`, `total_to_pay`, `total_expired`) |
| POST | `/api/bill_pays` | `@store` | Validação em `app/Http/Requests/BillPayRequest.php`; aceita `repeat`, `repeat_number`, `repeat_type` |
| GET | `/api/bill_pays/{id}` | `@show` | 404 para outro tenant (RN-CON-008) |
| PUT | `/api/bill_pays/{id}` | `@update` | Dispara `BillStoredEvent` com modelo antigo |
| DELETE | `/api/bill_pays/{id}` | `@destroy` | 204; não mexe no saldo (RN-CON-010) |
| GET | `/api/bill_pays/total_today` | `@findToPayToToday` | |
| GET | `/api/bill_pays/total_rest_of_month` | `@findToPayRestOfMonth` | |
| … | `/api/bill_receives/*` | `Api\BillReceivesController` | Mesma estrutura (`BillControllerTrait`) |

## Efeitos colaterais

`create`/`update` → `BillStoredEvent` → `BankAccountUpdateBalanceListener` → `bank_accounts.balance` + `statements`.

## Tabelas

Escreve: `bill_pays`, `bill_receives`, `bank_accounts` (balance), `statements`. Lê: `category_expenses`, `category_revenues`.
