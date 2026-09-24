---
description: Engenharia reversa de um módulo do legado → spec AS-IS
argument-hint: <modulo>
---
Use o subagente `arqueologo` para mapear o módulo `$ARGUMENTS` do legado (`legacy/`).

Siga a trilha completa: rota (`legacy/routes/`) → controller → request (validação) → repository
→ model/trait → eventos → listeners (`legacy/app/Providers/EventServiceProvider.php`) → migrations.

Produza/atualize em `.specs/legado/modulos/$ARGUMENTS/`:
- `comportamento.md`: propósito, endpoints (método, rota, payload, resposta), fluxos principais e
  alternativos, efeitos colaterais (eventos, saldo, extrato, e-mail, Pusher), tabelas lidas/escritas.
- `duvidas.md`: tudo que não pode ser confirmado só pelo código, com uma SONDA proposta para cada.

Toda afirmação cita `legacy/<arquivo>:<linha>`. Não invente comportamento: se não achou, é dúvida.
Atualize `.specs/legado/inventario.md` se encontrar algo não listado.
