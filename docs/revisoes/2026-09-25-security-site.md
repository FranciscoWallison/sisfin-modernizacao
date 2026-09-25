# Revisão de segurança: módulo `site` (cadastro, login, front novo) — S06

- **Data:** 25/09/2026
- **Revisor:** agente `security-reviewer`, somente leitura, com conferência humana.
- **Escopo:**
  - `api/src/modules/cadastro/**` e o login do `auth-compat` (mudado na S02);
  - a migration `lower(email)`;
  - `web/**`;
  - `docker/spa/nginx-novo.conf*`, Dockerfile e compose.
- **Regra do projeto:** hipótese vira teste que falha antes da correção:
  - `api/test/site-seguranca.integracao.spec.ts`;
  - `api/test/controles-memoria.spec.ts`;
  - `api/test/sensor-ilike.spec.ts`;
  - `web/e2e/site.e2e.ts`.

## Resultado

**Uma falha ALTA, introduzida por mim na S02 e pega antes do commit (S1).** Para igualar o legado, que não diferencia
maiúsculas no e-mail, usei `equals` com `mode: 'insensitive'` no Prisma. No Postgres isso vira `ILIKE` **sem escapar
`%` e `_`**. O teste confirmou: `POST /api/access_token {"email":"%","password":"secret"}` → **200 e o token do usuário
1**. Era pulverização de senha sem conhecer e-mail nenhum, com o lockout por e-mail contornado (cada padrão é uma chave
nova).

Confirmado correto pela leitura:

- mass assignment fechado no cadastro (`role`, `client_id`, `code` → 422; `role` fixo `client`);
- custo do bcrypt limitado (senha ≤ 20 e hash só depois da checagem de e-mail);
- corrida protegida pelo índice e pela transação;
- a exceção de tenant só cria;
- o login não é oráculo de e-mail (hash fictício e mensagem única);
- **o lockout já normalizava a capitalização**: a hipótese "alternar maiúsculas contorna o bloqueio" não se confirmou;
- o front remove o `?token=` antes do roteador, não tem open redirect nem `v-html`, e manda o token só no cabeçalho;
- CORS por allowlist, sem credenciais.

## Achados e desfecho

| id | sev. | achado | teste antes | desfecho |
|---|---|---|---|---|
| S1 | **Alta** | `mode: 'insensitive'` = ILIKE sem escape: login com `%` entrava como o 1º usuário; cadastro com `a_b` colidia com `axb`; `%@empresa.com` enumerava | ❌ `%` → 200 (token de `sub=1`); `a_b` → 422 | Igualdade por `lower(email) = lower($1)` (usa o índice) no login e no cadastro; **sensor** `sensor-ilike.spec.ts` impede `equals` + `insensitive` no código (mutação: dispara) |
| S2 | Média | Mapas em memória (tentativas, limite, blacklist) sem varredura: e-mails aleatórios de até 100 KB ficavam para sempre | ❌ e-mail de 300 caracteres → 400 (entrava no mapa) | E-mail do login ≤ 255; varredura periódica nos três mapas (mutação sem varredura: 3/4 testes falham; o bloqueio ativo não é varrido) |
| S3 | Média | Cadastro público só com o limite geral (60/min por IP): ~86 mil contas por dia, balde novo por conta, bcrypt no event loop | ❌ 5 cadastros seguidos → todos 201 | Balde **próprio**: `CADASTROS_POR_HORA` (padrão 5 por IP por hora; compose local 200, porque o E2E cadastra a cada execução) → 429 + `Retry-After` |
| S4 | Média | Sem CSP, `X-Frame-Options`, `nosniff` e `Cache-Control`: clickjacking no login/cadastro; nada contém um XSS na origem que guarda o token | — (cabeçalhos ausentes no `curl -I`) | `X-Frame-Options: DENY`, `nosniff`, `server_tokens off` em tudo; **CSP estrita no site novo** (`script-src 'self'`, `frame-ancestors 'none'`, `connect-src` só a API, via template); `no-store` em `/my-financial`. O E2E roda **com** a CSP (7/7) |
| S5 | Baixa | "The email has already been taken." é oráculo de enumeração, herdado do legado | — | **Risco aceito** (é o contrato do legado), mitigado pelo balde da S3; registrado no ADR-009 |
| S6 | Baixa | `\u0000` no e-mail do login → 500 | ❌ 500 | `SemNul` no `LoginDto` → 422 |
| S7 | Baixa | Log sem query só em `/my-financial`; o `error_log` registra a query | — | Log sem query no **servidor inteiro** (`$request_uri` sem os parâmetros); `error_log` só `crit` |
| S8 | Info | `req.ip` sem `trust proxy`: atrás de proxy, o limite e o lockout virariam globais | — | Pendência de implantação (já registrada desde a revisão de `contas`) |
| S9 | Info | `CORS_ORIGINS` inclui a origem do legado (dev) | — | Em produção, só a origem do front novo |
| S10 | Info | O índice `lower(email)` falharia com e-mails que diferem só na capitalização | — | Impossível vindo do legado (`utf8_unicode_ci`); o ETL o prova ao carregar |
| S11 | Info | Login 200 com `GET /user` falhando deixava a tela muda | — | Mensagem geral nas duas telas |

**Pendência nova:** CSP para o `/app`. O Vue 1 compila templates com `eval`, então a CSP ali exige `'unsafe-eval'` e
hash do script inline, e precisa ser testada tela a tela. Hoje o `/app` tem `X-Frame-Options`, `nosniff` e
`Referrer-Policy`.

## Lição

- **A correção de uma regressão pode abrir outra falha.** Consertei "login com maiúsculas" (RN-SIT-009) e, com a
  mesma linha, abri um login sem senha conhecida por e-mail. O teste escrito para a hipótese do revisor pegou a
  falha. Ela agora é um sensor permanente, e não só um teste deste módulo.
