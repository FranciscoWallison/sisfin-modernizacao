# Contrato — módulo `assinaturas` (AS-IS)

> Blade + sessão + CSRF, e um webhook JSON. Sonda: `tools/sondas/assinaturas-legado.mjs`. O oráculo não tem conta na
> Iugu: tudo que a chama dá 500 (ver regras).

| Rota | Método | Quem | Efeito / resposta |
|---|---|---|---|
| `/subscriptions/create` | GET | logado (visitante → 302 `/login`) | Página com o 1º plano (JSON no componente) e a `iugu.js` em modo de teste |
| `/subscriptions/store` | POST (form) | logado + CSRF | `payment_type` (`credit_card`\|`bank_slip`), `token_payment` se cartão. Validação → 302 de volta. Sucesso → 302 `/subscriptions/successfully`. Erro da Iugu → 302 de volta com mensagem; outros erros → 500 |
| `/subscriptions/successfully` | GET | logado | Página de sucesso |
| `/api/hooks/iugu` | POST (JSON) | **qualquer um** | `{event, data}`: `invoice.created`, `invoice.status_changed`, `subscription.renewed`; outro evento → 200 vazio; id inexistente → 500 |
| `/testasdasdasdasdasdas` | GET | **qualquer um** | Dispara o e-mail de assinatura ativa (quebrado) |

Tabelas: `plans (name, description, value string, code)`, `subscriptions (code, status 1|2, user_id, plan_id,
expires_at, canceled_at)`, `orders (date_due, payment_date, payment_url, code, status 1|2, value float,
subscription_id)`, `clients.code` (id do cliente na Iugu).

Gate (não aplicado): `400 {"error":"subscription_not_found","message":"Cliente sem assinatura contratada."}` e
`403 {"error":"subscription_expired","message":"Assinatura expirada."}`.
