# Regras de negócio — módulo `assinaturas` (AS-IS)

> Levantadas em 26/09/2026. Fontes:
> - código: `legacy/app/Http/Controllers/Site/SubscriptionsController.php`, `Api/IuguController.php`, `app/Iugu/*`
>   (clientes da Iugu e os managers), `Listeners/SubscriptionCreateListener.php`, `Http/Middleware/CheckSubscription.php`,
>   `Http/Requests/SubscriptionCreateRequest.php`, `Models/{Plan,Subscription,Order}.php`, migrations de `plans`,
>   `subscriptions` e `orders`, `PlansTableSeeder.php`, `Mail/FirstSubscriptionPaid.php`;
> - front: `resources/assets/site/js/components/subscription/SubscriptionCreate.vue` e o interceptor do SPA
>   (`resources/assets/spa/js/services/interceptors.js`);
> - sonda reproduzível: `tools/sondas/assinaturas-legado.mjs`.
>
> **Limite do oráculo:** ele não tem conta na Iugu (`IUGU_API_KEY` vazia no compose). Tudo que chama a Iugu dá 500
> por `IuguAuthenticationException` (conferido no `laravel.log`). O caminho feliz vem do código, não da sonda — cada
> regra diz de onde veio. Como o site, é Blade + sessão: a paridade HTTP não se aplica.

### RN-ASS-001 — Um plano só: o primeiro da tabela
- **Regra:** a tela e a criação usam `plans->all()->first()`. O seed tem um: "Plano Empresarial", `value` **"40"**
  (a coluna é `string`), `code = plan_business` (o identificador do plano **na Iugu**, onde o preço de verdade mora).
- **Evidência:** `SubscriptionsController::create/store`; migration `create_plans_table` (`value` string, `code`
  "integração com o pagamento"); `PlansTableSeeder`
- **Sonda:** passo 1 → a página traz `{"name":"Plano Empresarial","value":"40","code":"plan_business",…}` ✅
- **Paridade:** n/a (HTML → API + tela nova, ADR-011); aceite em P06
- **Confiança:** alta

### RN-ASS-002 — Tela de assinatura só para quem está logado; o cadastro leva a ela
- **Regra:** `/subscriptions/create|store|successfully` exigem sessão (`auth`) → visitante vai para `/login`. Depois do
  cadastro, o legado redireciona para `/subscriptions/create` (RN-SIT-001; no novo, DUV-SIT-004 mandou para o app).
- **Evidência:** `routes/web.php:54-58`; `Site/Auth/RegisterController.php:48`
- **Sonda:** passo 1 → visitante 302 `/login`; logado 200 ✅
- **Paridade:** n/a (ADR-011); aceite em P06
- **Confiança:** alta

### RN-ASS-003 — Forma de pagamento: cartão (tokenizado no navegador) ou boleto
- **Regra:**
  - `payment_type` obrigatório, `credit_card` ou `bank_slip`; `token_payment` obrigatório se cartão. Erro → volta para
    `/subscriptions/create`.
  - Os dados do cartão **não passam pelo servidor**: a `iugu.js` gera um token no navegador e só o token é enviado.
  - Mas o componente tem **modo de teste fixo** (`Iugu.setTestMode(true)`), um `AccountID` de exemplo
    (`"111…"`) e um cartão de teste **pré-preenchido** (`4111 1111 1111 1111`). Como está, nunca cobraria de verdade.
- **Evidência:** `SubscriptionCreateRequest::rules`; `SubscriptionCreate.vue` (`ready()` e `data()`)
- **Sonda:** passo 2 → sem tipo, tipo `pix`, cartão sem token: 302 `/subscriptions/create` ✅
- **Paridade:** n/a (ADR-011); aceite em P03/P06
- **Confiança:** alta

### RN-ASS-004 — Criar a assinatura: cliente na Iugu → forma de pagamento → assinatura → registro local
- **Regra (do código):**
  1. Se `clients.code` é nulo, cria o cliente na Iugu (nome e e-mail) e grava o id em `clients.code`.
  2. Cartão → cadastra o token como forma de pagamento padrão do cliente.
  3. Cria a assinatura na Iugu (`plan_identifier`, `payable_with`, `only_on_charge_success` = cartão).
  4. Um listener grava `subscriptions`: `code` (id na Iugu), `expires_at` (da Iugu), `user_id`, `plan_id`, `status`
     **ativo (1)** se a 1ª fatura já está paga, senão **inativo (2)**.
  - **Nada disso é transação:** se o passo 3 falha, o `clients.code` do passo 1 já ficou gravado.
  - **Nenhuma checagem de assinatura existente:** o mesmo cliente pode assinar de novo e ser cobrado duas vezes.
  - A assinatura é do **usuário** (`user_id`), mas o gate (RN-ASS-006) procura pelo **cliente**.
  - Erro da Iugu → mensagem por tipo ("Erro ao processar cliente/método de pagamento/assinatura. Contacte o
    atendimento…"). Erro fora dessa hierarquia (autenticação, rede) → **500**.
- **Evidência:** `IuguSubscriptionManager::create`, `IuguCustomerClient`, `IuguPaymentMethodClient`,
  `IuguSubscriptionClient::create`, `SubscriptionCreateListener`, `SubscriptionsController::getMessageException`
- **Sonda:** passo 3 → boleto e cartão: **500** (`IuguAuthenticationException`, sem chave) e nada gravado ✅
- **Paridade:** n/a (ADR-011); aceite em P03
- **Confiança:** média (caminho feliz só pelo código)

### RN-ASS-005 — Webhook `POST /api/hooks/iugu`: sem autenticação
- **Regra:**
  - Rota pública, fora do grupo `cors`, sem token, sem CSRF e **sem verificar a origem** (a Iugu permite um token no
    gatilho; não é usado). Evento desconhecido → 200 vazio.
  - `invoice.created` → consulta a assinatura na Iugu e cria `orders` com a fatura mais recente (`recent_invoices[0]`):
    vencimento, valor (texto "R$ 40,00" convertido para `float`), `payment_url`, status pago/pendente.
  - `invoice.status_changed` com `status = paid` → consulta a fatura na Iugu e marca a `order` paga, **sem conferir o
    status devolvido pela Iugu**: um evento forjado com o id de uma fatura real (o cliente vê o id na URL do boleto)
    marca a própria fatura pendente como paga.
  - `subscription.renewed` → consulta a assinatura na Iugu, copia `expires_at` e ativa; se é a 1ª fatura paga, manda o
    e-mail "Sua assinatura está ativa" (RN-ASS-008).
  - Id inexistente → exceção → **500** (a Iugu reenvia gatilhos que falham).
- **Evidência:** `routes/api.php:17` ("//CUIDADO"); `IuguController::hooks`; `OrderManager::create/paid`;
  `SubscriptionManager::renew`
- **Sonda:** passo 4 → evento qualquer 200; `status_changed` pendente 200; `invoice.created` e `subscription.renewed`
  com id inexistente 500 ✅ (no oráculo, 500 pela falta de chave)
- **Paridade:** n/a (a Iugu sai — ADR-011); aceite em P04
- **Confiança:** alta

### RN-ASS-006 — O gate de assinatura existe, mas nunca é aplicado
- **Regra:**
  - `CheckSubscription` (registrado como `check-subscription`) responderia: sem assinatura do cliente → **400**
    `{"error":"subscription_not_found","message":"Cliente sem assinatura contratada."}`; sem `expires_at`, inativa,
    cancelada ou vencida → **403** `{"error":"subscription_expired","message":"Assinatura expirada."}`.
  - O interceptor do SPA **desloga** o usuário em qualquer erro cujo `error` contenha "subscription".
  - Mas o middleware **não está em nenhuma rota** (RN-SIT-003): a API funciona sem assinatura.
- **Evidência:** `CheckSubscription.php`; `Kernel.php:60`; `grep check-subscription`; `interceptors.js:36-40`
- **Sonda:** passo 5 → cliente sem assinatura, `GET /api/bank_accounts` 200 ✅
- **Paridade:** n/a (o efeito de hoje — API sem assinatura — já é coberto pela paridade existente); gate: aceite em P05
- **Confiança:** alta

### RN-ASS-007 — Cancelamento existe no código, sem rota
- **Regra:** `SubscriptionManager::cancel` suspende na Iugu e marca inativa com `canceled_at`, mas **nada o chama**
  (nenhuma rota, nenhuma tela). Pelo sistema, não há como cancelar.
- **Evidência:** `grep -rn "cancel("` → só a definição
- **Paridade:** n/a (ADR-011); aceite em P03/P06
- **Confiança:** alta

### RN-ASS-008 — E-mail "Sua assinatura está ativa" e uma rota pública de teste
- **Regra:** na 1ª renovação paga, e-mail com a data de expiração. Há também `GET /testasdasdasdasdasdas`, **pública**,
  que dispara esse e-mail para `example@example.com` (e quebra: o `Mailable` exige uma assinatura).
- **Evidência:** `Mail/FirstSubscriptionPaid.php`; `emails/subscription_paid.blade.php`; `routes/web.php:19-24`
- **Paridade:** n/a; aceite em P04 (e-mail) e P06 (rota de teste não existe)
- **Confiança:** alta

### RN-ASS-009 — Dados: nenhuma assinatura no seed; valor da fatura em `float`
- **Regra:** `subscriptions` e `orders` vazias no seed; `orders.value` é `float` (como o dinheiro do resto do legado,
  RN-CON-011); `clients.code` nulo em todos (ninguém chegou à Iugu).
- **Evidência:** sonda passo 0 (`subs 0 · orders 0 · clientes_com_code 0`); migrations
- **Paridade:** n/a; aceite em P01 (ETL)
- **Confiança:** alta
