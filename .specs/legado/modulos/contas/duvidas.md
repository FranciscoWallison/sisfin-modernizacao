# Dúvidas — módulo `contas`

| ID | Dúvida | Evidência | Sonda proposta | Quem responde | Status |
|---|---|---|---|---|---|
| DUV-CON-001 | "Repetir N vezes" deveria gerar N ou N+1 contas? O que a tela do SPA mostra ao usuário? | RN-CON-001 | Ler o formulário em `legacy/resources/assets/spa/js/components/bill/` | Francisco (autor/PO) | ✅ decidido 25/09: manter N+1; a tela deve dizer "+N repetições" (ADR-003) |
| DUV-CON-002 | Conta criada **já paga** e com repetição: todas as cópias nascem pagas e debitam o saldo? | `BillRepositoryTrait.php:21-24` (cópias herdam `done`) + RN-CON-006 | `POST` com `done=true, repeat_number=2` e conferir o saldo | Sonda | ✅ **sim**: 3 contas pagas, saldo −30. ✅ decidido 25/09: bug — só a conta informada nasce paga (ADR-003) |
| DUV-CON-003 | Mover conta paga entre contas bancárias sem mover o saldo (RN-CON-009) é bug? | RN-CON-009 | — (confirmado por sonda) | Francisco | ✅ decidido 25/09: corrigir — estorna na antiga, debita na nova (ADR-003) |
| DUV-CON-004 | Excluir conta paga sem estornar (RN-CON-010) é bug? E o que fazer com o extrato: apagar, estornar ou bloquear a exclusão? | RN-CON-010 | — (confirmado por sonda) | Francisco | ✅ decidido 25/09: estornar + extrato de estorno, histórico preservado (ADR-003) |
| DUV-CON-005 | Já houve divergência saldo × extrato em produção? (extrato criado fora da transação) | RN-CON-007 | Somar `statements.value` por conta e comparar com `balance` no banco seed | Sonda | ⏳ aberta |
| DUV-CON-006 | Usuário **sem** `client` chamando a API: o landlord deixa de filtrar e ele vê tudo? (No seed, até o admin tem `client_id`; mas `users.client_id` é `NULL`-able.) | `AddCliebtTenantMiddleware.php:21-23` | Inserir via SQL um usuário com `client_id NULL`, logar e `GET /api/bill_pays` | Sonda | ⏳ aberta |
| DUV-CON-007 | O seed usa Faker sem semente fixa — os dados mudam a cada `migrate --seed`. | `legacy/database/seeds/*` | — | — | ✅ resolvida: `docker/legacy/seeds/DeterministicSeeder.php` fixa `mt_srand`/Faker (seed 42) sem editar o legado. Limite: datas do Faker são relativas ao dia do seed — os casos de paridade usam deltas e dados próprios, nunca valores do seed |
| DUV-CON-008 | Valor negativo em conta a pagar/receber deve ser aceito? | RN-CON-015 | — (confirmado por sonda) | Francisco | ✅ decidido 25/09: rejeitar valor ≤ 0 (ADR-003) |
| DUV-CON-009 | O SPA sempre envia `search` na listagem (o que esconderia a RN-CON-016)? | RN-CON-016 | Ler `legacy/resources/assets/spa/js/` (store/serviço de bills) | Arqueólogo | ✅ respondida 25/09: **sim** — `services/search-options.js` sempre envia `search: ''`; no oráculo (ICU 63.1) `NumberFormatter::parse('')` devolve `0`, então a tela de contas listaria vazio. Provável que o ICU do Heroku em 2017 devolvesse `false` (lista funcionava): **o comportamento depende do ambiente do oráculo**. Decisão proposta no ADR-004 |

## Achados fora do módulo (para o inventário / security-reviewer)

| Achado | Evidência |
|---|---|
| Rota pública de teste envia e-mail sem autenticação | `legacy/routes/web.php:19` (`GET /testasdasdasdasdasdas`) |
| Webhook da Iugu sem validação de origem | `legacy/routes/api.php:17` → `legacy/app/Http/Controllers/Api/IuguController.php:36-51` |
| `ngrok.exe` (16 MB) versionado no repositório | `legacy/ngrok.exe` |
| Bundle do SPA não está versionado (só `public/build/admin.bundle.js`) — o SPA precisa de build com Node 6 | `legacy/public/build/` |
