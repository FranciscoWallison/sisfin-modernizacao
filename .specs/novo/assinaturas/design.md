Status: rascunho

# Design — módulo `assinaturas` — TO-BE

> Implementa `requirements.md` (REQ-ASS-01..07). Decisões: ADR-011 (proposto). Segue o caminho do ADR-009 (API +
> `web/`, login único por JWT).

## 1. Dados (migration Prisma)

| Tabela | Colunas | Observação |
|---|---|---|
| `plans` | `id`, `name`, `description`, `value` DECIMAL(12,2), timestamps | ETL do legado (`value` texto → decimal). Sem tenant |
| `clients` | + `stripe_customer_id` VARCHAR único, nulo | O `code` (id na Iugu) continua como veio |
| `subscriptions` | `id`, `client_id` (tenant), `plan_id`, `provider_subscription_id` único, `status` (texto do Stripe: `active`, `trialing`, `past_due`, `canceled`, `unpaid`, `incomplete`…), `current_period_end`, `cancel_at_period_end`, `canceled_at`, timestamps | **Índice único parcial**: uma assinatura viva por cliente (status fora de `canceled`/`incomplete_expired`) |
| `webhook_events` | `id` (id do evento no Stripe, PK), `type`, `received_at` | Idempotência (REQ-ASS-03) |

`Subscription` entra em `MODELOS_COM_TENANT`. As tabelas `subscriptions`/`orders` do legado **não** são copiadas (não
portáveis — DUV-ASS-009): o ETL relata as contagens.

## 2. API (`api/src/modules/assinaturas/`)

```text
domain/
  assinatura.ts        estado → "vale para usar o app?" (função pura; regra do CheckSubscription do legado)
  eventos.ts           evento do Stripe → mudança de estado local (puro; ordem e repetição tratadas)
application/
  assinaturas.service.ts   checkout, portal, estado; aplica eventos do webhook
  gateway-de-pagamento.ts  a PORTA: criarCliente, criarCheckout, criarPortal, verificarEvento(corpoCru, assinatura)
infra/
  stripe.gateway.ts        adaptador real (SDK `stripe` 22.x, versão fixada)
  simulador.gateway.ts     sem rede: ids determinísticos; checkout → URL da própria origem
  assinaturas.repositorio.ts   PRISMA_TENANT; o webhook resolve o cliente por stripe_customer_id e executa no contexto dele
http/
  assinaturas.controller.ts   GET /api/plans, GET /api/subscription, POST /api/subscriptions/checkout|portal
  webhook.controller.ts       POST /api/hooks/stripe (corpo cru, sem JWT)
  assinatura.guard.ts         o gate (REQ-ASS-05), plugado no ComCliente
```

- **Webhook:** `NestFactory.create(…, { rawBody: true })` e verificação pelo SDK (`webhooks.constructEvent`) nos **dois**
  adaptadores — o simulador também exige assinatura. Os testes geram o cabeçalho com o segredo de teste
  (`webhooks.generateTestHeaderString`), exatamente como o Stripe CLI faria. Ordem de processamento: grava o id do
  evento e aplica a mudança **na mesma transação**; id repetido → 200 sem efeito. O objeto do evento é a fonte do
  estado (assinado); não se consulta o Stripe de volta.
- **Sem tenant no webhook:** `Client` não tem tenant; o repositório acha o cliente por `stripe_customer_id` e executa a
  escrita em `ContextoCliente.executarAsync(clienteId)`. Nenhum SQL cru novo.
- **Checkout:** trava o cliente (advisory lock, chave nova no registro) → assinatura viva? 422 → cliente do provedor
  (cria uma vez) → sessão com `success_url = <site>/subscriptions/successfully` e `cancel_url = <site>/subscriptions/create`
  (origem da configuração, nunca do cabeçalho `Host`) e `client_reference_id = clientId`.
- **Gate:** `ComCliente()` ganha o `AssinaturaGuard`, que não faz nada com `EXIGIR_ASSINATURA=false`. As rotas do
  próprio módulo usam `ComCliente({ semAssinatura: true })`.
- **Config** (`lerConfig`): `PAGAMENTOS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SITE_URL`,
  `EXIGIR_ASSINATURA`. Produção: só `stripe` e as três chaves obrigatórias. Compose local: `simulador`, com um segredo
  de webhook **de desenvolvimento** (não é chave do Stripe).

## 3. Telas (`web/`)

- `/subscriptions/create`: plano (`GET /api/plans`) + "Assinar" → `POST /api/subscriptions/checkout` →
  `location.assign(url)` depois de conferir a origem da URL.
- `/subscriptions/successfully`: consulta `GET /api/subscription` por alguns segundos; "processando" até ficar ativa.
- "Minha conta": estado da assinatura + "Gerenciar assinatura" (portal) ou "Assinar".
- CSP inalterada (navegação de página inteira).

## 4. Stripe real (roteiro manual, P07)

Com as chaves **de teste** do Francisco num `.env` fora do git: `PAGAMENTOS=stripe`; produto e preço criados no painel;
`stripe listen --forward-to localhost:3300/api/hooks/stripe` fornece o segredo do webhook; cartão de teste do Stripe
(`4242 4242 4242 4242`); conferir ativação, portal, cancelamento no fim do período e falha de pagamento
(`4000 0000 0000 0341`). Evidências no diário.

## 5. Testes

| Nível | O quê |
|---|---|
| Unitário | `assinatura.ts` (vencida, cancelada, sem data — os casos do `CheckSubscription`); `eventos.ts` (ordem, repetição, estados); config |
| Integração (api) | checkout (cliente do provedor criado uma vez; 2ª assinatura → 422; corrida de dois checkouts); webhook assinado (válido, inválido, sem cabeçalho, repetido, fora de ordem, cliente desconhecido); estado e portal; gate ligado e desligado; tenant (um cliente não vê a assinatura de outro) |
| ETL | `plans` copiado; contagens da Iugu relatadas |
| Tela | E2E com o simulador: assinar → webhook assinado → ativa em "Minha conta" → portal |
| Manual | roteiro do §4 |

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Webhook forjado (o do legado aceitava) | Assinatura verificada sobre o corpo cru; teste com assinatura inválida |
| Evento repetido ou fora de ordem | Tabela de eventos + estado a partir do objeto do evento (período e status), não de contagem |
| Cobrança dupla | Uma assinatura viva por cliente (lock + índice único parcial) |
| Chave vazada num repositório público | Só em variável de ambiente; config recusa chave ausente em produção; nada de chave no front |
| Ligar o gate derruba todos os clientes | Desligado por padrão; ligar é decisão registrada |
