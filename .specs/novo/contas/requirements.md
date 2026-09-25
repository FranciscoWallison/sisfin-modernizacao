Status: rascunho — aguardando aprovação do Francisco (requirements → design → tasks)

# Requirements — módulo `contas` (TO-BE)

> Gerado a partir de `.specs/legado/modulos/contas/regras.md` (RN-CON-001..015) e `duvidas.md`.
> Decisões marcadas **(proposta)** dependem de uma dúvida em aberto e só valem depois de aprovadas; ver ADR-003.
> Contrato: **mesmas rotas e formatos do legado** (`/api/bill_pays`, `/api/bill_receives`), salvo onde indicado — ADR-001.
> Aceite: casos em `.specs/paridade/contas/`. Onde a decisão é *corrigir*, o caso ganha um bloco `divergencias`
> com o resultado esperado no sistema novo e a referência ao ADR.

---

### REQ-CON-01 — Validação da criação e edição
Origem: RN-CON-013, RN-CON-014 · Decisão: **corrigir** (013) + **manter** (014)

- QUANDO uma conta for criada ou editada sem `category_id` ou sem `bank_account_id`
  O SISTEMA DEVE responder **422** com o campo faltante, sem gravar nada.
  *(legado: 500 por erro de banco)*
- QUANDO `category_id` ou `bank_account_id` pertencerem a outro cliente
  O SISTEMA DEVE responder **422** `"The selected bank account id is invalid."` / equivalente para categoria.
- `name` obrigatório (≤ 255), `date_due` data válida, `done` booleano.

Aceite: `RN-CON-013-a-015-validacao.json` → `sem_categoria_e_conta: 422` (divergência ADR-003), `conta_bancaria_de_outro_tenant: 422` (paridade exata).

### REQ-CON-02 — Valor monetário
Origem: RN-CON-011, RN-CON-015 · Decisão: **corrigir** (011) + **corrigir (proposta, DUV-CON-008)** (015)

- O SISTEMA DEVE armazenar `value`, `balance` e valores de extrato como **decimal com 2 casas** (nunca ponto flutuante).
- QUANDO `value` for ≤ 0
  O SISTEMA DEVE responder **422**. *(legado: aceita negativo e inverte o efeito no saldo)*
- A API continua expondo o valor como número JSON (compatível com o front).

Aceite: `RN-CON-013-a-015-validacao.json` → `valor_negativo_pago: 422`, sem efeito no saldo (divergência ADR-003).

### REQ-CON-03 — Repetição de contas
Origem: RN-CON-001, RN-CON-002 · Decisão: **manter (proposta, DUV-CON-001)**

- QUANDO uma conta for criada com `repeat=true`, `repeat_number=N` e `repeat_type` 1 (mensal) ou 2 (anual)
  O SISTEMA DEVE criar a conta informada **e mais N** contas.
- A conta *n* DEVE vencer em `date_due + n meses` (ou anos), calculado sempre a partir da data original;
  se o dia não existir no mês de destino, DEVE usar o último dia desse mês.

Aceite: `RN-CON-001-repeticao.json` (paridade exata).

### REQ-CON-04 — Pagamento movimenta saldo e gera extrato
Origem: RN-CON-003, RN-CON-004, RN-CON-005 · Decisão: **manter**

- QUANDO uma conta passar de em aberto para paga, O SISTEMA DEVE aplicar **−valor** (a pagar) ou **+valor** (a receber) ao saldo da conta bancária.
- QUANDO uma conta paga tiver o valor alterado e continuar paga, O SISTEMA DEVE aplicar somente a diferença.
- QUANDO uma conta paga for desmarcada, O SISTEMA DEVE estornar o valor anterior.
- Cada movimento DEVE gerar um registro de extrato com o valor movimentado e o saldo resultante.

Aceite: `RN-CON-003-a-005-ciclo-do-saldo.json` (paridade exata).

### REQ-CON-05 — Conta criada já paga
Origem: RN-CON-006 · Decisão: **manter** a conta informada + **corrigir (proposta, DUV-CON-002)** as repetições

- QUANDO uma conta for criada com `done=true`, O SISTEMA DEVE movimentar o saldo na criação.
- QUANDO uma conta paga for criada com repetição, **somente a conta informada** nasce paga;
  as N repetições DEVEM nascer **em aberto** e não movimentar o saldo. *(legado: todas pagas, saldo −30 para 3 parcelas)*

Aceite: `RN-CON-006-criar-ja-paga.json` → `delta_criar_paga: -10` (paridade), `delta_criar_paga_com_repeticao: -10` e cópias `done=false` (divergência ADR-003).

### REQ-CON-06 — Atomicidade de conta, saldo e extrato
Origem: RN-CON-007 · Decisão: **corrigir**

- A gravação da conta, a atualização do saldo (com lock da conta bancária) e o registro de extrato DEVEM ocorrer
  **na mesma transação**: ou tudo é gravado, ou nada. *(legado: conta e extrato fora da transação do saldo)*

Aceite: teste de integração no sistema novo com falha injetada entre os passos (não observável por HTTP).

### REQ-CON-07 — Isolamento por cliente (tenant)
Origem: RN-CON-008, RN-CON-014 · Decisão: **manter**

- Um usuário SÓ PODE ler, alterar ou excluir contas do próprio cliente.
- QUANDO acessar conta de outro cliente, O SISTEMA DEVE responder **404** (não 403, para não revelar a existência).
- O isolamento DEVE ser aplicado em um único ponto (camada de acesso a dados), com teste estrutural — ver `design.md`.

Aceite: `RN-CON-008-isolamento-tenant.json` (paridade exata) + teste estrutural de tenant.

### REQ-CON-08 — Mover conta paga entre contas bancárias
Origem: RN-CON-009 · Decisão: **corrigir (proposta, DUV-CON-003)**

- QUANDO uma conta paga tiver `bank_account_id` alterado, O SISTEMA DEVE estornar o valor na conta antiga
  e aplicá-lo na nova, com um registro de extrato em cada. *(legado: nenhum saldo muda)*

Aceite: `RN-CON-009-mover-conta-paga.json` → `delta_conta_a: +10`, `delta_conta_b: −10` (divergência ADR-003).

### REQ-CON-09 — Excluir conta paga
Origem: RN-CON-010 · Decisão: **corrigir (proposta, DUV-CON-004)**

- QUANDO uma conta paga for excluída, O SISTEMA DEVE estornar o valor no saldo e registrar um extrato de estorno.
  O histórico de extrato é preservado (nunca apagado). *(legado: saldo não muda; extrato fica órfão)*

Aceite: `RN-CON-010-excluir-conta-paga.json` → `delta_excluir: +10` (divergência ADR-003).

### REQ-CON-10 — Estado inicial de `done`
Origem: RN-CON-012 · Decisão: **descartar** a assimetria

- `done` DEVE ter default `false` em contas a pagar e a receber.

Aceite: migração de schema revisada no `design.md`.

---

## Fora de escopo deste módulo

- Totais (`total_today`, `total_rest_of_month`, `bill_data`) e busca por data/valor em formato BR — mapear em `/mapear-modulo contas` antes do design.
- Rota pública de teste `/testasdasdasdasdasdas` e webhook Iugu — tratados nos módulos `auth` e `assinaturas`.
