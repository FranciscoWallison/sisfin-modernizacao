# Revisão de segurança — módulo `assinaturas` (A07 / P07) · 26/09/2026

> Revisor: agente independente, só leitura, com sondas HTTP na stack local (simulador; clientes descartáveis). Escopo:
> `api/src/modules/assinaturas/**`, o gate (`shared/tenant/assinatura.guard.ts`, `com-cliente.ts`), a configuração,
> `main.ts` (`rawBody`), a migration, o ETL de `plans` e as telas `web/src/paginas/assinatura/`.
>
> Regra do projeto: cada achado real vira um teste que **falha antes** da correção (conferido: todos falharam pelo
> motivo certo, sem 429 no meio — lição 27) e, depois, **mutação** (desfazer só a correção → o teste volta a falhar).

A assinatura do webhook estava certa. Os problemas estavam **depois** dela, em como o evento é aplicado. Dois foram
reproduzidos na API local: um cliente que **pagou** ficava bloqueado, sem erro no log, e sem reenvio do Stripe.

| # | Severidade | Achado | Situação |
|---|---|---|---|
| S1 | **alta** | `created` e `updated` simultâneos: o mais antigo sobrescrevia o mais novo | ✅ corrigido |
| S2 | média | Empate no mesmo segundo: `incomplete` desfazia `active` | ✅ corrigido |
| S3 | média | Tela e gate olhavam a última linha, não a assinatura vigente | ✅ corrigido |
| S4 | média | Janela de cobrança dupla (sessão perto de vencer; webhook atrasado) | ✅ corrigido; resíduo abaixo |
| S5 | média | Simulador valia em qualquer `NODE_ENV` diferente de `production` | ✅ corrigido |
| S6 | baixa | Produção aceitava chave de **teste** do Stripe; `SITE_URL` sem https | ✅ corrigido |
| S7 | baixa | Webhook no limite de 60/min por IP; renovação atrasada bloqueava | ✅ corrigido |
| S8 | baixa | `incomplete` (3DS abandonado) travava novo checkout por 23 h | ✅ corrigido |
| S9 | baixa | Checkout segura uma conexão durante as chamadas ao Stripe | aceito (documentado) |
| S10 | info | Chave de idempotência igual entre ambientes; `paused`/`resumed`; `webhook_events` sem limpeza; portal | parcial |

## S1 — alta: evento antigo sobrescrevia o novo (reproduzido)

- **Cenário real:** ao fechar o Checkout, o Stripe manda `customer.subscription.created` (`incomplete`) e
  `customer.subscription.updated` (`active`) quase juntos. Sem trava, as duas transações liam o mesmo estado e a do
  `incomplete` gravava por último. Os dois eventos ficavam em `webhook_events` (sem reenvio). Resultado: pagou, o gate
  bloqueia e o checkout responde 422 até o próximo evento (talvez a renovação, um mês depois). Variante: as duas
  criavam a linha, a segunda dava P2002 e era engolida como "já tem assinatura viva".
- **Correção (duas camadas):**
  - eventos da **mesma assinatura em série**: `pg_advisory_xact_lock(eventoDaAssinatura, hashtext(id))` no início da
    transação (chave nova no registro único);
  - o estado gravado é o **atual no provedor** (`GatewayDePagamento.estadoAtual` → `subscriptions.retrieve` no Stripe;
    no simulador, o próprio evento) — o que o Stripe recomenda: a ordem de chegada deixa de importar;
  - P2002: só o índice "uma viva por cliente" vira log + 200; qualquer outra violação volta a 500 (o provedor reenvia).
- **Testes:** "S1: created incomplete e updated active SIMULTÂNEOS" (8 rodadas); "S1: o estado gravado é o ATUAL do
  provedor"; "segunda assinatura ATIVA → 200 sem registrar". Mutações: sem o lock, sem o `estadoAtual`, sem distinguir o
  P2002 → cada uma derruba o seu teste.

## S2 — média: empate no mesmo segundo (reproduzido)

- `event.created` tem só segundos; no empate, o último a chegar vencia, e um `incomplete` atrasado desfazia `active`.
- **Correção:** no empate, `incomplete` nunca desfaz outro estado (`domain/eventos.ts`). **Teste:** unitário "S2".

## S3 — média: a tela e o gate viam a última linha (reproduzido)

- Uma segunda tentativa que expirou incompleta (`incomplete_expired`) virava a "assinatura" do cliente, escondendo a
  ativa paga; com o gate ligado, 403.
- **Correção:** `escolherVigente` (domínio): a que libera (maior fim de período) → a viva mais recente → a mais recente.
  **Teste:** "S3" (GET e o gate). Mutação: voltar à última linha → falha.

## S4 — média: janela de cobrança dupla

- Sessão guardada com ≤ 10 min de vida → abria-se outra **sem expirar** a anterior (duas abas pagáveis). E, se o
  webhook atrasasse ou se perdesse, o banco local não sabia da assinatura e deixava abrir outro checkout.
- **Correção:** o id da sessão é guardado e a anterior é **expirada** antes de abrir outra; antes do checkout, o
  **provedor** é consultado (`temAssinaturaViva` → `subscriptions.list`). **Testes:** "S4" (dois). Mutações: sem
  expirar, sem consultar o provedor → falham.
- **Resíduo:** se mesmo assim nascer uma segunda assinatura viva (o índice parcial barra o registro), ela é só um
  **erro no log** — não é cancelada nem reembolsada automaticamente. Ação manual no painel.

## S5 — média: simulador fora de development/test

- `NODE_ENV=staging`, `prod` ou ausente caía no simulador, cujo segredo é público e os ids são previsíveis: qualquer um
  forjaria eventos (ativar a própria assinatura, cancelar a de outro cliente).
- **Correção:** simulador só em `development`/`test` (lista fechada); fora disso, `PAGAMENTOS=stripe` e segredo
  explícito. **Teste:** unitário (staging, prod, homologacao → não sobe; test → simulador).

## S6 — baixa: chave de teste em produção

- `sk_test_` em produção: o cartão `4242` do Stripe liberaria o app de graça. **Correção:** produção exige
  `sk_live_`/`rk_live_` e `SITE_URL` https. **Teste:** unitário.

## S7 — baixa: webhook no limite por IP

- 60/min por IP: um pico de renovações viraria 429 e horas de reenvio, com o cliente pagante bloqueado (sem tolerância).
- **Correção:** `/api/hooks/stripe` fora do limite (a autenticação é a assinatura HMAC; corpo limitado a 100 KB) e
  **tolerância de 2 dias** depois do fim do período para quem está liberado (falha de cobrança vira `past_due`, que
  bloqueia na hora). **Testes:** "S7: 65 eventos seguidos → todos 200" (com o limitador de verdade); unitários da
  tolerância. Mutação: webhook de volta no limite → falha.

## S8 — baixa: `incomplete` travava novo checkout

- **Correção:** `incomplete` não impede nova assinatura nem conta no índice parcial (migration). **Teste:** "S8".

## S9 e S10 — aceitos ou parciais

- **S9:** a transação do checkout segura uma conexão enquanto espera o Stripe (timeout de 20 s). Checkout é raro por
  cliente; aceito e registrado. Se virar gargalo: lock curto e chamadas fora da transação.
- **S10:** chave de idempotência agora com o host do `SITE_URL` (dois ambientes na mesma conta não colidem);
  `customer.subscription.paused`/`resumed` passam a ser tratados. Pendentes: limpeza periódica de `webhook_events`; no
  painel, o portal deve **não** permitir trocar de plano nem criar assinatura (está no roteiro da P07).

## Conferido e OK (resumo do revisor)

- Assinatura do webhook sobre o corpo cru: sem cabeçalho, HMAC errado, `t` de 10 min atrás, `text/plain` → 400; 150 KB
  → 413. Respostas genéricas; log só com ids.
- Idempotência por id do evento; `stripeCustomerId` e a sessão só são gravados pelo servidor (sem mass-assignment); o
  `metadata.client_id` não decide nada.
- Tenant: `Subscription` na lista fechada; evento de uma assinatura de outro cliente falha fechado.
- URLs de volta vêm do `SITE_URL`, nunca do `Host`; `destinoSeguro` no front só aceita Stripe ou a própria origem.
- Gate: todas as rotas de dados passam pelo `ComCliente`; isentas só as da assinatura, planos, usuário, login, cadastro
  e webhook; ligado sem o verificador → erro (falha fechada).
- Nenhuma chave versionada; `.env.stripe` no `.gitignore`.
