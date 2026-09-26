# Roteiro — assinatura com o Stripe de verdade (modo de teste) · P07 / ADR-011

> O dia a dia (testes, CI, E2E) usa o **simulador**: sem rede e sem chave. Este roteiro liga o Stripe **em modo de
> teste** na API local para conferir a integração real. Nenhuma chave vai para o git: elas ficam em `.env.stripe`
> (no `.gitignore`). **Nunca use chaves `live` aqui.**

## 1. Preparar o Stripe (uma vez)

1. Crie a conta em <https://dashboard.stripe.com/register> e mantenha o painel em **modo de teste**.
2. **Produto e preço:** *Catálogo de produtos* → "Plano Empresarial", preço **recorrente mensal de R$ 40,00** (o valor
   que a tela mostra, da tabela `plans`). Copie o id do preço (`price_…`).
3. **Chave secreta de teste:** *Desenvolvedores → Chaves de API* → `sk_test_…`.
4. **Portal do cliente:** *Configurações → Faturamento → Portal do cliente* → ative e permita **cancelar no fim do
   período** e **atualizar o cartão**.
5. **Stripe CLI** (<https://docs.stripe.com/stripe-cli>): `stripe login`.

## 2. Ligar na API local

```powershell
Copy-Item .env.stripe.exemplo .env.stripe          # e preencha STRIPE_SECRET_KEY e STRIPE_PRICE_ID
stripe listen --forward-to localhost:3300/api/hooks/stripe
# ↑ mostra "Your webhook signing secret is whsec_…": copie para STRIPE_WEBHOOK_SECRET no .env.stripe
docker compose -f docker-compose.yml -f docker-compose.stripe.yml up -d --build api
```

Deixe o `stripe listen` aberto: é ele que entrega os eventos no `localhost`.

## 3. O que conferir (anote o resultado no diário)

| # | Passo | Esperado |
|---|---|---|
| 1 | Cadastre um usuário novo em <http://localhost:8083/register> e abra **Minha conta** | "Sua empresa ainda não tem assinatura." |
| 2 | **Assinar** | A tela mostra R$ 40,00; o botão leva a `checkout.stripe.com` com o **mesmo valor** do preço criado |
| 3 | Pague com `4242 4242 4242 4242`, validade futura, CVC qualquer | Volta para "Pagamento em processamento…" e, em segundos, **"Assinatura ativa!"**; o `stripe listen` mostra `customer.subscription.created` → `200` |
| 4 | **Minha conta** | "Ativa — Plano Empresarial · Renova em <data>" |
| 5 | **Gerenciar assinatura** → cancelar | Abre `billing.stripe.com`; ao voltar: "Termina em <data>" (continua ativa até lá) |
| 6 | Em outra janela, **Assinar** de novo com o mesmo usuário | A tela diz que já existe assinatura ativa (a API responde 422) |
| 7 | Com outro usuário, pague com `4000 0000 0000 0341` (cartão recusado depois de anexado) | Checkout recusa; nenhuma assinatura "Ativa" |
| 8 | No painel: *Assinaturas* → cancelar agora | `customer.subscription.deleted` → 200; Minha conta: "Cancelada" |
| 9 | `stripe trigger customer.subscription.updated` | 200 e nada muda (cliente do Stripe desconhecido no SisFin) |

## 4. Desligar

```powershell
docker compose up -d --build api      # volta ao simulador (o override não é usado)
```

Se precisar, apague a chave no painel do Stripe depois dos testes.
