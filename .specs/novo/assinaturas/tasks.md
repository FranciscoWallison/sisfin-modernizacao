Status: rascunho

# Tasks — módulo `assinaturas`

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs assinaturas "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **P01. Dados e ETL** — migration (`plans`, `subscriptions` com índice único parcial, `webhook_events`, `clients.stripe_customer_id`); `Subscription` no tenant; ETL copia `plans` e relata assinaturas/faturas da Iugu; `GET /api/plans`. Aceite: teste de schema; ETL do seed (1 plano, 0 assinaturas); integração do `GET /api/plans`. **REQ-ASS-01**.
- [ ] **P02. Porta, simulador e configuração** — `GatewayDePagamento`, simulador, adaptador Stripe (SDK fixado), `PAGAMENTOS`/chaves/`SITE_URL`/`EXIGIR_ASSINATURA` na config validada; domínio (`assinatura.ts`, `eventos.ts`). Aceite: unitários (config recusa produção sem chaves ou com simulador; regras de estado). **REQ-ASS-05, REQ-ASS-07**.
- [ ] **P03. Checkout, estado e portal** — `POST /api/subscriptions/checkout`, `GET /api/subscription`, `POST /api/subscriptions/portal`. Aceite: integração com o simulador (cliente do provedor criado uma vez; 2ª assinatura → 422; dois checkouts simultâneos → um só; outro cliente não vê). **REQ-ASS-02, REQ-ASS-04**.
- [ ] **P04. Webhook** — `POST /api/hooks/stripe` com corpo cru, assinatura verificada, idempotência e eventos → estado; `/api/hooks/iugu` → 404. Aceite: integração com eventos assinados (válido, inválido, sem cabeçalho, repetido, fora de ordem, cliente desconhecido). **REQ-ASS-03**.
- [ ] **P05. Gate de assinatura** — `AssinaturaGuard` no `ComCliente` (desligado por padrão). Aceite: integração com `EXIGIR_ASSINATURA` ligado (400/403 com os corpos do legado; rotas livres continuam livres) e desligado (paridade existente intacta). **REQ-ASS-05**.
- [ ] **P06. Telas no `web/`** — `/subscriptions/create`, `/subscriptions/successfully`, estado e portal em "Minha conta". Aceite: E2E com o simulador (assinar → webhook assinado → ativa → portal; `/testasdasdasdasdasdas` → não encontrada). **REQ-ASS-06**.
- [ ] **P07. Stripe real, segurança e documentação** — roteiro manual com as chaves de teste do Francisco (Stripe CLI); revisão de segurança (webhook, segredos, cobrança dupla, redirecionamento); achados viram testes que falham antes da correção; progresso, diário, README, inventário, CI. **REQ-ASS-02, REQ-ASS-03, REQ-ASS-07**.
