# Progresso — módulo `assinaturas` (Iugu → Stripe)

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 9 regras, 10 dúvidas, contrato; sonda `tools/sondas/assinaturas-legado.mjs` | O oráculo não tem conta Iugu: caminho feliz derivado do código; cobrança nunca operou |
| TO-BE | ✅ | requirements, ADR-011, design e tasks aprovados (hash `542d2e109610`) | |
| P01. Dados e ETL | ✅ | `test/schema.spec.ts` (+5: `plans.value` DECIMAL, tenant, índice parcial, `webhook_events`, `stripe_customer_id`); ETL do seed: 1 plano (40.00), 0 assinaturas Iugu; `GET /api/plans` na integração | `Subscription` na lista de tenant |
| P02. Porta, simulador e config | ✅ | `test/assinaturas-config.spec.ts` (24), `test/assinaturas-dominio.spec.ts` (19) | SDK `stripe` 22.6.2 (API `2026-08-26.dahlia`: fim do período nos itens) |
| P03. Checkout, estado e portal | ✅ | Integração: cliente do provedor criado uma vez; sessão reaproveitada; 3 checkouts simultâneos → 1 sessão; 422 para quem já assina; outro cliente não vê; portal | Mutações: sem lock, sem reaproveitar, sem a checagem → cada uma derruba um teste |
| P04. Webhook | ✅ | Integração com eventos assinados: sem cabeçalho, outro segredo, corpo alterado → 400; repetido; fora de ordem; cancelamento no fim do período; cliente desconhecido; `/api/hooks/iugu` → 404 | Mutações: sem verificação, sem idempotência, sem ordem → falham |
| P05. Gate | ✅ | Integração com `EXIGIR_ASSINATURA` ligado: 400/403 com os corpos do legado; rotas livres; ativa libera; cancelada e vencida (além da tolerância) → 403 | Desligado por padrão (a paridade existente segue valendo) |
| P06. Telas | ✅ | `web/e2e/assinaturas.e2e.ts` (3): plano → Checkout (simulador) → webhook assinado → "Assinatura ativa!" → "Minha conta" → portal; webhook inválido 400; rota de teste do legado → não encontrada. Vitest 34 (+10) | `docs/imgs/web-assinatura-*.png` |
| P07. Stripe real, segurança e documentação | 🟡 | Revisão de segurança: [`docs/revisoes/2026-09-26-security-assinaturas.md`](../../../docs/revisoes/2026-09-26-security-assinaturas.md) — 1 alta + 4 médias corrigidas, cada uma com teste vermelho antes e mutação depois. Roteiro [`docs/roteiro-stripe.md`](../../../docs/roteiro-stripe.md), `docker-compose.stripe.yml`, `.env.stripe.exemplo` | **Falta:** executar o roteiro com as chaves de TESTE do Francisco (ato humano: a conta e as chaves são dele) |

## Resultado do módulo

- A cobrança sai da Iugu (que nunca operou) e vai para o Stripe, atrás de uma porta com simulador.
- Números no fechamento: API 461 testes; web 34 unitários + 14 E2E; espelho 20/20; paridade 23/24 nos dois alvos
  (RN-CAT-001, pendência anterior).

## Pendências

| Item | Onde | Quando |
|---|---|---|
| Executar o roteiro com o Stripe real (modo de teste) | `docs/roteiro-stripe.md` | Quando Francisco criar a conta e as chaves de teste |
| Segunda assinatura viva (resíduo do S4): hoje só log de erro, sem cancelar/reembolsar | serviço + painel | Se acontecer, ação manual; automatizar se virar recorrente |
| Limpeza periódica de `webhook_events` | job | Melhoria |
| Ligar o gate (`EXIGIR_ASSINATURA=true`) | decisão de produto | Quando houver clientes pagantes (hoje bloquearia todos) |
| Boleto e Pix | conta Stripe brasileira ativada | Decisão de produto (DUV-ASS-003) |
