# ADR-005 — Segurança do `auth-compat` e controles transversais entram junto com `contas`

- **Status:** aceito — aprovado por Francisco em 25/09/2026 (junto com o plano, `tasks.md` hash d854ed6545ef)
- **Data:** 25/09/2026

## Contexto

O design original deixava logout, revogação, lockout e rate limit "para o módulo `auth`". A revisão de segurança
(`docs/revisoes/2026-09-25-security-contas.md`, achados #3 e #4) e as sondas mostraram que o legado **já tem** esses
controles (RN-AUT-001..003): adiar significaria colocar em produção um sistema **menos seguro** que o de 2017 —
por exemplo, um token de logout continuaria valendo por até 60 minutos.

## Decisão

1. `auth-compat` entrega junto com `contas`: lockout (5 erros → 403), rate limit 60/min, logout com blacklist de `jti`,
   HS256 fixo com claims obrigatórias, segredo ≥ 32 bytes e **diferente do legado**.
2. Correções transversais do REQ-CON-13: whitelist de corpo, tetos (`repeat_number` ≤ 120, `value` ≤ 999.999.999,99),
   filtro de exceções sem vazamento, redação de logs, auditoria (`user_id` + `action` no extrato), CORS com allowlist.
3. **Risco aceito temporariamente:** a claim `user{id,name,email}` continua no JWT (nome e e-mail em claro no payload)
   porque o SPA atual depende dela. Removida quando o front novo (`web/`) substituir o SPA.
4. `refresh_token` continua no módulo `auth`.

## Consequências

- A Fase A do `tasks.md` cresce (T05–T07 maiores, T17 nova).
- O caso `paridade/auth/RN-AUT-001-a-003-sessao.json` vira critério de aceite do `auth-compat`.
- Sonda de 25/09: execuções repetidas da suíte de paridade bateram no rate limit do legado (**429**); o executor
  agora respeita `Retry-After` e avisa — o mesmo vai acontecer contra o sistema novo, por design.
