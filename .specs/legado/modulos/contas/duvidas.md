# Dúvidas — módulo `contas`

| ID | Dúvida | Evidência | Sonda proposta | Quem responde | Status |
|---|---|---|---|---|---|
| DUV-CON-001 | "Repetir N vezes" deveria gerar N ou N+1 contas? O que a tela do SPA mostra ao usuário? | RN-CON-001 | Ler o formulário em `legacy/resources/assets/spa/js/components/bill/` | Francisco (autor/PO) | ⏳ aberta |
| DUV-CON-002 | Conta criada **já paga** e com repetição: todas as cópias nascem pagas e debitam o saldo? | `BillRepositoryTrait.php:21-24` (cópias herdam `done`) + RN-CON-006 | `POST` com `done=true, repeat_number=2` e conferir o saldo | Sonda | ⏳ aberta |
| DUV-CON-003 | Mover conta paga entre contas bancárias sem mover o saldo (RN-CON-009) é bug? | RN-CON-009 | — (confirmado por sonda) | Francisco | ⏳ decidir: corrigir? |
| DUV-CON-004 | Excluir conta paga sem estornar (RN-CON-010) é bug? E o que fazer com o extrato: apagar, estornar ou bloquear a exclusão? | RN-CON-010 | — (confirmado por sonda) | Francisco | ⏳ decidir |
| DUV-CON-005 | Já houve divergência saldo × extrato em produção? (extrato criado fora da transação) | RN-CON-007 | Somar `statements.value` por conta e comparar com `balance` no banco seed | Sonda | ⏳ aberta |
| DUV-CON-006 | Usuário **sem** `client` (ex.: admin do seed) chamando a API: o landlord deixa de filtrar e ele vê tudo? | `AddCliebtTenantMiddleware.php:21-23` | Login como `admin@user.com` e `GET /api/bill_pays` | Sonda | ⏳ aberta |
| DUV-CON-007 | O seed usa Faker sem semente fixa — os dados mudam a cada `migrate --seed`. Fixar semente para o golden master? | `legacy/database/seeds/*` | — | Francisco | ⏳ aberta |

## Achados fora do módulo (para o inventário / security-reviewer)

| Achado | Evidência |
|---|---|
| Rota pública de teste envia e-mail sem autenticação | `legacy/routes/web.php:19` (`GET /testasdasdasdasdasdas`) |
| Webhook da Iugu sem validação de origem | `legacy/routes/api.php:17` → `legacy/app/Http/Controllers/Api/IuguController.php:36-51` |
| `ngrok.exe` (16 MB) versionado no repositório | `legacy/ngrok.exe` |
| Bundle do SPA não está versionado (só `public/build/admin.bundle.js`) — o SPA precisa de build com Node 6 | `legacy/public/build/` |
