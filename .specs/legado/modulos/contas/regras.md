# Regras de negócio — módulo `contas` (AS-IS)

> Contas a pagar (`BillPay`) e a receber (`BillReceive`), repetição, efeito no saldo da conta bancária e no extrato.
> Sondas executadas em 24/09/2026 contra o oráculo (`docker compose up -d`), usuário `cliente1@user.com` (client_id 2).

### RN-CON-001 — Repetição cria N+1 contas
- **Regra:** ao criar uma conta com `repeat=true` e `repeat_number=N`, o sistema grava a conta original **e mais N cópias**.
- **Evidência:** `legacy/app/Repositories/Traits/BillRepositoryTrait.php:34` (cria a original) e `:20` (`range(1, $repeatNumber)` cria mais N)
- **Sonda:** `POST /api/bill_pays` com `repeat_number=3`, `date_due=2027-01-31` → 4 linhas em `bill_pays` (ids 201–204) ✅
- **Exemplo:** `repeat_number=12` → 13 contas
- **Confiança:** alta (comportamento) · intenção desconhecida → DUV-CON-001
- **Suspeita de bug?** talvez — depende do que a tela promete ("repetir 3 vezes" = 3 ou 4 parcelas?)

### RN-CON-002 — Vencimento das repetições é calculado a partir da data original, com ajuste para o último dia do mês
- **Regra:** a cópia *n* vence em `data_original + n meses` (ou anos, se `repeat_type=2`). Se o dia não existir no mês de destino, usa o último dia desse mês. Como o cálculo parte sempre da data original, o dia 31 volta nos meses que o têm.
- **Evidência:** `legacy/app/Models/AbstractBill.php:42-57` (duplicado em `legacy/app/Models/BillTrait.php:9`)
- **Sonda:** 31/01/2027 → 28/02, 31/03, 30/04 ✅
- **Confiança:** alta
- **Suspeita de bug?** não

### RN-CON-003 — Marcar conta como paga movimenta o saldo e gera extrato
- **Regra:** quando `done` passa de `false` para `true`, o saldo da conta bancária recebe **−valor** (conta a pagar) ou **+valor** (conta a receber), e um registro de `statements` é criado com o valor movimentado e o saldo resultante.
- **Evidência:** `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:71-73` (delta) e `:47-53` (saldo + extrato); ligado em `legacy/app/Providers/EventServiceProvider.php:32-34`
- **Sonda:** conta a pagar de 10,00 marcada paga → saldo da conta 10: 486,00 → 476,00; extrato `value=-10, balance=476` ✅
- **Confiança:** alta

### RN-CON-004 — Alterar o valor de uma conta que continua paga movimenta só a diferença
- **Regra:** se a conta estava e continua paga e o valor muda, o saldo recebe `antigo − novo` (a pagar) ou `novo − antigo` (a receber).
- **Evidência:** `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:66-68`
- **Sonda:** conta paga de 10,00 alterada para 25,00 → saldo 476,00 → 461,00; extrato `value=-15` ✅
- **Confiança:** alta

### RN-CON-005 — Desmarcar pagamento estorna o valor antigo
- **Regra:** quando `done` passa de `true` para `false`, o saldo recebe **+valor antigo** (a pagar) ou **−valor antigo** (a receber).
- **Evidência:** `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:74-75`
- **Sonda:** conta paga de 25,00 desmarcada → saldo +25; extrato `value=25`; saldo volta ao inicial ✅ (`paridade/contas/RN-CON-003-a-005-ciclo-do-saldo.json`)
- **Confiança:** alta

### RN-CON-006 — Conta criada já paga movimenta o saldo na criação
- **Regra:** na criação não há modelo anterior; `doneOld` é tratado como `false`, então uma conta criada com `done=true` já debita/credita o saldo.
- **Evidência:** `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:63-64` + `:71-73`
- **Sonda:** criada paga com 10,00 → saldo −10 ✅. Criada paga com `repeat_number=2` → 3 contas, **todas pagas**, saldo −30 ✅ (`paridade/contas/RN-CON-006-criar-ja-paga.json`)
- **Confiança:** alta
- **Suspeita de bug?** sim, na combinação com repetição: parcelas futuras nascem pagas e já debitam o saldo hoje (DUV-CON-002)

### RN-CON-007 — Atualização do saldo é atômica e com lock; o extrato fica fora da transação
- **Regra:** `addBalance` abre transação e trava a linha da conta bancária antes de somar; o `Statement` é criado depois do commit.
- **Evidência:** `legacy/app/Repositories/BankAccountRepositoryEloquent.php:31-36` (transação + `LockTableCriteria`) e `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:48` (extrato após o commit)
- **Confiança:** alta (código)
- **Suspeita de bug?** sim — falha entre os dois passos deixa saldo e extrato divergentes (DUV-CON-005)

### RN-CON-008 — Contas são isoladas por cliente (tenant)
- **Regra:** usuários só enxergam contas do próprio `client_id`; contas de outro cliente respondem **404** (não 403).
- **Evidência:** `legacy/app/Models/AbstractBill.php:14` (`BelongsToTenants`) + `legacy/app/Http/Middleware/AddCliebtTenantMiddleware.php:18-23`
- **Sonda:** conta 201 (client 2) lida por `cliente3` (client 2) → 200; por `cliente2/4/5/6` (clients 5, 3, 5, 4) → 404 ✅
- **Confiança:** alta

### RN-CON-009 — Mover uma conta paga para outra conta bancária NÃO move o saldo
- **Regra:** trocar `bank_account_id` de uma conta paga, sem mudar valor nem `done`, resulta em delta 0: nenhuma conta bancária é alterada e nenhum extrato é criado.
- **Evidência:** `legacy/app/Listeners/BankAccountUpdateBalanceListener.php:57-79` (nenhum ramo considera `bank_account_id`) e `:44` (usa só a conta nova)
- **Sonda:** conta 201 paga (25,00) movida da conta 10 para a 12 → saldos inalterados (10: 461,00 · 12: 301,00) ✅
- **Confiança:** alta
- **Suspeita de bug?** **sim** — o débito continua na conta antiga

### RN-CON-010 — Excluir uma conta paga NÃO estorna o saldo e deixa extrato órfão
- **Regra:** `DELETE` não dispara `BillStoredEvent`; o saldo permanece e os `statements` continuam apontando para a conta apagada.
- **Evidência:** `legacy/app/Repositories/Traits/BillRepositoryTrait.php` (só `create` e `update` disparam evento; não há `delete`)
- **Sonda:** `DELETE /api/bill_pays/201` → 204; saldo da conta 10 continua 461,00; 2 extratos com `statementable_id=201` permanecem ✅
- **Confiança:** alta
- **Suspeita de bug?** **sim**

### RN-CON-011 — Valores monetários são `float`
- **Regra:** `value` de contas, `balance` de contas bancárias e `value`/`balance` do extrato são colunas `FLOAT`.
- **Evidência:** `legacy/database/migrations/2017_09_13_014016_create_bill_pays_table.php:20`, `2017_09_16_182802_create_bill_receives_table.php:20`, `2017_09_16_180047_add_balance_to_bank_accounts.php:18`, `2017_09_16_155447_create_statements_table.php:18-19`
- **Confiança:** alta
- **Suspeita de bug?** sim — dinheiro em ponto flutuante acumula erro de arredondamento

### RN-CON-012 — `done` tem default 0 em contas a receber, mas nenhum default em contas a pagar
- **Regra:** `bill_receives.done` tem `DEFAULT 0`; `bill_pays.done` é `NOT NULL` **sem default**.
- **Evidência:** `legacy/database/migrations/2017_09_13_014016_create_bill_pays_table.php:21` — `->defalt(false)` (erro de digitação: o Laravel 5.3 aceita o método desconhecido em silêncio e não aplica o default); compare com `2017_09_16_182802_create_bill_receives_table.php:21` (`->default(false)`)
- **Sonda:** `SHOW COLUMNS` no oráculo → `bill_pays.done Default NULL` · `bill_receives.done Default 0` ✅
- **Confiança:** alta
- **Suspeita de bug?** sim — inofensivo enquanto o ORM sempre envia `done`, mas a assimetria não deve ser migrada
