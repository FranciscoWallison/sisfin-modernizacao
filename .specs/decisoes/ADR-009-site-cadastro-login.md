# ADR-009 — Site (cadastro, login e convite): de Blade + sessão para API + tela nova

- **Status:** aceito — aprovado — Francisco, 25/09/2026 (com o plano, hash af43e2de4789)
- **Data:** 25/09/2026

## Contexto

O site do legado (`.specs/legado/modulos/site/`) é Blade + sessão + CSRF, separado do SPA. O levantamento mostrou:

- **Cadastro:** cria cliente + usuário, fora de transação; `client.email` não é validado como e-mail (RN-SIT-001/002).
- **Assinatura nunca exigida:** o usuário cadastrado usa a API inteira sem assinar, porque o middleware de assinatura
  não está em nenhuma rota (RN-SIT-003).
- **JWT na URL:** o SPA abre o site passando o JWT na URL, e ele vira uma sessão web (RN-SIT-005).
- **Convite quebrado:** sempre 500 (RN-SIT-006).
- **CSRF ausente → 500** (RN-SIT-008).

Francisco escolheu (25/09) o caminho **endpoints na API nova + telas novas**, em vez de reproduzir páginas no servidor.
O SPA atual é compilado de `legacy/`, que não se edita. As telas do site são, portanto, o **início do front novo
(Vue 3)**.

## Decisão

1. **Cadastro vira API:** `POST /api/register` (JSON).
   - Mesmos campos, regras e mensagens do legado (RN-SIT-002).
   - Cliente + usuário numa transação; `role = client`; bcrypt.
   - Resposta `201 { token }`, o mesmo JWT do `access_token`.
2. **Login e logout do site usam a API existente** (`POST /api/access_token` e `/api/logout`), com o lockout e o rate
   limit já migrados (RN-AUT-*, ADR-005). **Sem sessão web e sem cookie**, o que elimina CSRF e a ponte JWT → sessão.
3. **Tela nova** (Vue 3 + Vite, `web/`), servida pelo **mesmo nginx e na mesma origem** do SPA (`:8083`):
   - `/`, `/login`, `/register` e `/my-financial`;
   - depois do login ou cadastro, grava o token em `localStorage['token']`, a chave que o SPA lê, e vai para `/app`.
4. **Correções:**

| Regra | Legado | Sistema novo | Dúvida |
|---|---|---|---|
| RN-SIT-006 | Convite: POST sempre 500 | **Não migrado.** `/my-financial/invite` não existe; "convidar para o meu cliente" é proposta de produto à parte | DUV-SIT-001 |
| RN-SIT-002 | `client.email` sem formato | Validado como e-mail | DUV-SIT-002 |
| RN-SIT-005 | JWT na URL vira sessão | A tela de `/my-financial` ignora e apaga o `?token=` da barra; `Referrer-Policy: no-referrer`; o nginx não registra a query | DUV-SIT-003 |
| RN-SIT-001 | Depois do cadastro → `/subscriptions/create` | → `/app`, já logado, até o módulo `assinaturas` existir | DUV-SIT-004 |
| RN-SIT-001 | Sem transação | Transação + e-mail único também no banco | DUV-SIT-005 |
| RN-SIT-008 | CSRF ausente → 500 | Não se aplica: JWT em cabeçalho, sem cookie | — |

5. A rota pública de teste `/testasdasdasdasdasdas`, que dispara e-mail, **não é migrada**.

## Consequências

- **Paridade HTTP (JSON) não se aplica:** o contrato muda de HTML para API. As regras RN-SIT-* têm "Paridade: n/a" com a
  task que as cobre. A evidência do legado fica nas sondas reproduzíveis (`tools/sondas/site-*.mjs`). O aceite no novo
  é:
  - teste de integração com as **mesmas mensagens** que as sondas capturaram;
  - Playwright na tela nova.
- **Nasce o `web/`** (Vue 3 + Vite + TypeScript), com build no mesmo Dockerfile do SPA novo. Os módulos seguintes com
  tela (admin de bancos, assinaturas) entram nele.
- O menu do SPA continua apontando para `/my-financial?token=…`, porque não editamos o SPA. A mitigação é do lado de
  quem recebe (DUV-SIT-003).
- **Risco aceito (revisão de segurança S5):** "The email has already been taken." permite descobrir se um e-mail tem
  conta. É o contrato do legado; a mitigação é o limite próprio do cadastro (5 por IP por hora, `CADASTROS_POR_HORA`),
  e a confirmação de e-mail fica como pendência de produto.
