# ADR-011 — Assinaturas: Stripe no lugar da Iugu, atrás de uma porta com simulador

- **Status:** aceito — aprovado — Francisco, 26/09/2026 (com o plano, hash 542d2e109610)
- **Data:** 26/09/2026

## Contexto

O levantamento (`.specs/legado/modulos/assinaturas/`) mostrou um módulo de cobrança que **nunca operou**:

- o front tem o modo de teste da Iugu **fixo**, um id de conta de exemplo e um cartão de teste pré-preenchido
  (RN-ASS-003);
- o gate de assinatura existe, mas **não está em nenhuma rota**: ninguém precisa pagar para usar (RN-ASS-006);
- o webhook é **público** e aceita evento forjado (RN-ASS-005); criar assinatura não é transação e permite assinar
  duas vezes (RN-ASS-004); cancelar não tem rota (RN-ASS-007);
- o oráculo não tem conta na Iugu: o caminho feliz só existe no código.

Francisco decidiu trocar a Iugu pelo **Stripe** (DUV-ASS-001): modo de teste sem burocracia, assinatura recorrente
nativa, páginas hospedadas e o Stripe CLI para levar webhooks ao `localhost`.

## Decisão

1. **Porta `GatewayDePagamento`** no módulo `assinaturas`, com dois adaptadores:
   - **Stripe** (SDK oficial `stripe`, versão fixada);
   - **simulador**: sem internet nem chave; usado em testes, CI e E2E.
   Escolha por configuração (`PAGAMENTOS=stripe|simulador`). Em produção só vale `stripe`, e a API não sobe sem
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PRICE_ID`. **Nenhuma chave no repositório** (é público).
2. **Pagamento pelo Stripe Checkout** (página hospedada, modo assinatura), **só cartão** nesta etapa (DUV-ASS-002/003).
3. **Assinatura do cliente (tenant), no máximo uma viva por cliente** (DUV-ASS-005).
4. **Estado vem do webhook** `POST /api/hooks/stripe`: assinatura `Stripe-Signature` verificada sobre o corpo cru,
   idempotência pelo id do evento (DUV-ASS-007). O retorno do Checkout só mostra "processando". `/api/hooks/iugu` não
   é migrado.
5. **Cancelar, trocar cartão e ver faturas pelo portal do cliente do Stripe** (DUV-ASS-006).
6. **Gate de assinatura** com os corpos do legado, **desligado por padrão** (`EXIGIR_ASSINATURA=false`), o que mantém o
   comportamento real de hoje (DUV-ASS-004).
7. **Dados:** `plans` migra; assinaturas e faturas da Iugu não são portáveis — o ETL relata quantas havia (DUV-ASS-009).
   Preço no Stripe; `plans` guarda o que a tela mostra (DUV-ASS-010).
8. **Não migrados:** e-mail próprio de "assinatura ativa" (o Stripe manda recibos) e a rota pública de teste
   (DUV-ASS-008).

## Consequências

- **Paridade HTTP não se aplica** (HTML, provedor externo): aceite por integração (com webhooks assinados de verdade,
  gerados com o segredo de teste), E2E com o simulador e um **roteiro manual com o Stripe real** (Stripe CLI) quando
  Francisco puser as chaves de teste dele no ambiente.
- Com o gate desligado, a paridade existente continua valendo (a API responde sem assinatura, como no legado).
- A CSP do site novo não muda: a ida ao Checkout e ao portal é navegação de página inteira (a API devolve a URL; o
  front faz `location.assign`), e nenhum script do Stripe roda no nosso front. A URL devolvida é conferida
  (`https://checkout.stripe.com/` ou `https://billing.stripe.com/`; no simulador, a própria origem).
- Troca futura de provedor = um adaptador novo.
