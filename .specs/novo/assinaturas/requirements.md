Status: rascunho

# Requirements — módulo `assinaturas` — TO-BE

> Gerado de `.specs/legado/modulos/assinaturas/regras.md` (RN-ASS-001..009) e `duvidas.md` (DUV-ASS-001..010).
> Decisões: ADR-011 (proposto). Aceite: integração (API + banco + webhooks assinados), E2E com o simulador e roteiro
> manual com o Stripe em modo de teste.

### REQ-ASS-01 — Plano
Origem: RN-ASS-001, RN-ASS-009 · Decisão: **manter** o plano único; **mudar** o preço para o Stripe — ADR-011 (DUV-ASS-010)

- `GET /api/plans` (autenticado) DEVE devolver os planos (`id`, `name`, `description`, `value` em número).
- O ETL DEVE copiar `plans` do legado (`value` texto → decimal) e relatar quantas assinaturas e faturas da Iugu existiam.

Aceite: integração (formato); ETL (seed: 1 plano, 0 assinaturas).

### REQ-ASS-02 — Assinar pelo Stripe Checkout
Origem: RN-ASS-002, RN-ASS-003, RN-ASS-004 · Decisão: **substituir** a Iugu pelo Stripe Checkout, só cartão — ADR-011 (DUV-ASS-002/003/005)

- `POST /api/subscriptions/checkout` (usuário com cliente) DEVE criar (ou reaproveitar) o cliente no provedor, gravar
  o id dele no cliente, e devolver `{ "url": … }` da sessão de pagamento no modo assinatura.
- Cliente que já tem assinatura viva → 422 `{"message":"Client already has an active subscription."}` e nada criado.
- O cartão NUNCA passa pela API nem pelo front.

Aceite: integração com o simulador (URL devolvida; cliente do provedor gravado uma vez; segunda assinatura → 422).

### REQ-ASS-03 — Webhook do Stripe
Origem: RN-ASS-005 · Decisão: **corrigir** (público e forjável no legado) — ADR-011 (DUV-ASS-007)

- `POST /api/hooks/stripe` DEVE verificar a assinatura `Stripe-Signature` sobre o corpo cru. Inválida ou ausente → 400
  e nada gravado.
- Cada evento DEVE ser processado **uma vez** (id do evento guardado); repetido → 200 sem efeito.
- Eventos tratados: sessão de checkout concluída, assinatura criada/atualizada/excluída, fatura paga, falha de
  pagamento. O estado local (status, fim do período, cancelamento) DEVE refletir o objeto do Stripe; evento de um
  cliente/assinatura desconhecido → 200 e nada gravado (registrado no log).
- `/api/hooks/iugu` NÃO DEVE existir (404).

Aceite: integração com eventos assinados com o segredo de teste (válido, inválido, repetido, fora de ordem).

### REQ-ASS-04 — Estado da assinatura e portal
Origem: RN-ASS-006, RN-ASS-007 · Decisão: **nova implementação** — ADR-011 (DUV-ASS-006)

- `GET /api/subscription` DEVE devolver a assinatura do cliente (`status`, `current_period_end`, `cancel_at_period_end`,
  plano) ou 404.
- `POST /api/subscriptions/portal` DEVE devolver `{ "url": … }` do portal do cliente (cancelar, trocar cartão,
  faturas). Cliente sem cadastro no provedor → 404.

Aceite: integração com o simulador.

### REQ-ASS-05 — Gate de assinatura (desligado por padrão)
Origem: RN-ASS-006, RN-SIT-003 · Decisão: **manter o efeito** de hoje (desligado); regra pronta para ligar — ADR-011 (DUV-ASS-004)

- Com `EXIGIR_ASSINATURA=true`, as rotas de dados do cliente DEVEM responder como o `CheckSubscription` do legado: sem
  assinatura → 400 `subscription_not_found`; vencida, cancelada ou inativa → 403 `subscription_expired`. As rotas de
  login, cadastro, usuário, planos e assinatura continuam livres.
- Com `EXIGIR_ASSINATURA=false` (padrão), nada muda.

Aceite: unitário (a regra "vencida" como função pura) + integração com a chave ligada e desligada.

### REQ-ASS-06 — Telas no `web/`
Origem: RN-ASS-001, RN-ASS-002, RN-ASS-003, RN-ASS-008 · Decisão: **nova implementação** — ADR-011

- `/subscriptions/create`: o plano e o botão "Assinar", que leva ao Checkout. `/subscriptions/successfully`: "pagamento
  em processamento" até o webhook confirmar. "Minha conta": estado da assinatura e "Gerenciar assinatura" (portal).
- A URL de redirecionamento DEVE ser do Stripe (ou, no simulador, da própria origem).
- `/testasdasdasdasdasdas` NÃO DEVE existir.

Aceite: E2E com o simulador (assinar → webhook assinado → "Minha conta" mostra ativa → portal).

### REQ-ASS-07 — Configuração e segredos
Origem: RN-ASS-003 · Decisão: **corrigir** (chave e modo de teste fixos no front do legado) — ADR-011

- `PAGAMENTOS=stripe|simulador` na configuração validada. Em produção, só `stripe`, e a API NÃO DEVE subir sem
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PRICE_ID`. Nenhuma chave versionada.

Aceite: unitário da configuração; roteiro manual com o Stripe em modo de teste (Stripe CLI).
