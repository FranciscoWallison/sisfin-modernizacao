Status: rascunho — aguardando aprovação do Francisco

# Requirements — módulo `site` (cadastro e login) — TO-BE

> Gerado de `.specs/legado/modulos/site/regras.md` (RN-SIT-001..008) e `duvidas.md` (DUV-SIT-001..006).
> Correções e mudança de contrato (HTML → API + tela nova): ADR-009 (proposto).
> Aceite: testes de integração com as mensagens capturadas pelas sondas (`tools/sondas/site-*.mjs`) + Playwright.

### REQ-SIT-01 — Cadastro pela API cria cliente e usuário, atômico
Origem: RN-SIT-001 · Decisão: **manter** o efeito; **corrigir** a atomicidade — ADR-009

- QUANDO `POST /api/register` vier válido, O SISTEMA DEVE, **numa transação**:
  - criar o cliente (`client.name`, `client.email`);
  - criar o usuário (`name`, `email`, senha em bcrypt, `role = client`) ligado a ele;
  - responder `201 { "token": "<JWT>" }`, o mesmo formato do `access_token`.
- Se qualquer passo falhar, nada DEVE ser gravado.

Aceite: integração (cliente + usuário no banco; hash bcrypt; `role` client; o token serve para `GET /api/user`; falha
provocada no 2º passo → nenhum cliente órfão).

### REQ-SIT-02 — Validação com as mensagens do legado
Origem: RN-SIT-002 · Decisão: **manter**, e **corrigir** o formato de `client.email` — ADR-009

- O SISTEMA DEVE aplicar:
  - `name` required|max:255;
  - `email` required|email|max:255|único;
  - `password` required|min:6|max:20|confirmed;
  - `client.name` required|max:255;
  - `client.email` required|max:255|**email** *(legado: sem formato)*.
- Erro → 422 no formato do Laravel (`{"campo": ["mensagem"]}`), com as mensagens capturadas pelas sondas.
- Dois cadastros simultâneos com o mesmo e-mail → um 201 e um 422 `email` (nunca 500).

Aceite: integração com as 9 mensagens do `contrato.md` do módulo; corrida de e-mail duplicado.

### REQ-SIT-03 — Usuário cadastrado usa o sistema
Origem: RN-SIT-003 · Decisão: **manter** (a assinatura nunca foi exigida; o módulo `assinaturas` decidirá)

- O usuário recém-cadastrado DEVE conseguir usar a API (listas vazias do seu cliente) com o token recebido.

Aceite: integração (`GET /api/bank_accounts` → 200, lista vazia; não enxerga nada de outro cliente).

### REQ-SIT-04 — Login e logout pela API existente, sem sessão
Origem: RN-SIT-004, RN-SIT-007 · Decisão: **substituir** a sessão pelo JWT — ADR-009

- A tela de login DEVE usar `POST /api/access_token` e mostrar a mensagem de erro que a API devolve. O lockout é o já
  migrado (RN-AUT-*).
- O logout DEVE chamar `POST /api/logout` e apagar `localStorage['token']`.

Aceite: Playwright (senha errada mostra a mensagem; certa leva ao `/app`; sair volta ao login e o token deixa de valer).

### REQ-SIT-05 — Telas novas na mesma origem do SPA
Origem: RN-SIT-001, RN-SIT-004 · Decisão: **nova implementação** — ADR-009

- `/`, `/login`, `/register` e `/my-financial` DEVEM ser servidos pelo nginx da `:8083`, junto com `/app`.
- Depois do cadastro ou do login, a tela DEVE gravar o JWT em `localStorage['token']` e ir para `/app`. *(legado:
  cadastro → `/subscriptions/create`, DUV-SIT-004)*
- As mensagens de validação DEVEM aparecer junto de cada campo.

Aceite: Playwright (cadastro completo → `/app` já logado, com o dashboard carregando; erros por campo).

### REQ-SIT-06 — Sem JWT na URL
Origem: RN-SIT-005, RN-SIT-008 · Decisão: **corrigir** — ADR-009

- QUANDO `/my-financial` for aberto com `?token=`, a tela NÃO DEVE usar nem enviar o parâmetro. DEVE removê-lo da barra
  de endereço (`history.replaceState`) e usar o token do `localStorage`.
- O nginx DEVE:
  - responder `Referrer-Policy: no-referrer` nas telas novas;
  - não registrar a query string no log de acesso de `/my-financial`.
- Nenhuma rota do sistema novo DEVE aceitar JWT por query string.

Aceite: Playwright (a URL final não tem `token=`); `curl` do cabeçalho; teste de integração
(`GET /api/user?token=<JWT>` sem cabeçalho → 401).

### REQ-SIT-07 — Convite não migrado
Origem: RN-SIT-006 · Decisão: **não migrar** — ADR-009 (DUV-SIT-001)

- `/my-financial/invite` NÃO DEVE existir no sistema novo. A página `/my-financial` mostra o usuário logado e um link
  para o app.

Aceite: Playwright (`/my-financial` abre com o nome do usuário; `/my-financial/invite` cai na página "não encontrada"
do front).
