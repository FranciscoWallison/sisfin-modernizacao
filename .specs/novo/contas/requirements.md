Status: REQ-CON-01..10 aprovados por Francisco em 25/09/2026 · adendo REQ-CON-11..13 aguardando aprovação

# Requirements — módulo `contas` (TO-BE)

> Gerado a partir de `.specs/legado/modulos/contas/regras.md` (RN-CON-001..015) e `duvidas.md`.
> Decisões que dependiam de dúvidas foram aprovadas em 25/09/2026 — ver ADR-003. O adendo REQ-CON-11..12 segue o ADR-004 e o REQ-CON-13 segue o ADR-005, ambos propostos.
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
Origem: RN-CON-011, RN-CON-015 · Decisão: **corrigir** (011) + **corrigir (aprovada, DUV-CON-008)** (015)

- O SISTEMA DEVE armazenar `value`, `balance` e valores de extrato como **decimal com 2 casas** (nunca ponto flutuante).
- QUANDO `value` for ≤ 0
  O SISTEMA DEVE responder **422**. *(legado: aceita negativo e inverte o efeito no saldo)*
- A API continua expondo o valor como número JSON (compatível com o front).

Aceite: `RN-CON-013-a-015-validacao.json` → `valor_negativo_pago: 422`, sem efeito no saldo (divergência ADR-003).

### REQ-CON-03 — Repetição de contas
Origem: RN-CON-001, RN-CON-002 · Decisão: **manter (aprovada, DUV-CON-001)**

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
Origem: RN-CON-006 · Decisão: **manter** a conta informada + **corrigir (aprovada, DUV-CON-002)** as repetições

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
Origem: RN-CON-009 · Decisão: **corrigir (aprovada, DUV-CON-003)**

- QUANDO uma conta paga tiver `bank_account_id` alterado, O SISTEMA DEVE estornar o valor na conta antiga
  e aplicá-lo na nova, com um registro de extrato em cada. *(legado: nenhum saldo muda)*

Aceite: `RN-CON-009-mover-conta-paga.json` → `delta_conta_a: +10`, `delta_conta_b: −10` (divergência ADR-003).

### REQ-CON-09 — Excluir conta paga
Origem: RN-CON-010 · Decisão: **corrigir (aprovada, DUV-CON-004)**

- QUANDO uma conta paga for excluída, O SISTEMA DEVE estornar o valor no saldo e registrar um extrato de estorno.
  O histórico de extrato é preservado (nunca apagado). *(legado: saldo não muda; extrato fica órfão)*

Aceite: `RN-CON-010-excluir-conta-paga.json` → `delta_excluir: +10` (divergência ADR-003).

### REQ-CON-10 — Estado inicial de `done`
Origem: RN-CON-012 · Decisão: **descartar** a assimetria

- `done` DEVE ter default `false` em contas a pagar e a receber.

Aceite: migração de schema revisada no `design.md`.

---

### REQ-CON-11 — Listagem e busca *(adendo — aguardando aprovação)*
Origem: RN-CON-016, RN-CON-017 · Decisão: **corrigir** (016) + **manter** (017) — ADR-004

- QUANDO `search` estiver ausente ou vazio, O SISTEMA DEVE listar todas as contas do cliente (paginadas, 15 por página, `orderBy`/`sortedBy`). *(legado no oráculo: filtra `value = 0` e lista vazio)*
- QUANDO `search` for informado, O SISTEMA DEVE combinar com OU: texto contido em `name`; intervalo `dd/mm/aaaa-dd/mm/aaaa` em `date_due`; valor em formato BR (`1.234,56`) igual a `value`.
  O filtro de cliente é sempre aplicado com E por fora.
- A resposta mantém o formato `{ data: { bills: { data, meta.pagination }, bill_data } }` — ver `.specs/legado/modulos/contas/contrato.md`.

Aceite: `RN-CON-016-a-018-listagem-e-totais.json` → `lista_sem_busca_vazia: false` (divergência ADR-004).

### REQ-CON-12 — Totais coerentes com a lista *(adendo — aguardando aprovação)*
Origem: RN-CON-018 · Decisão: **corrigir** — ADR-004

- `bill_data.total_paid`, `total_to_pay` e `total_expired` DEVEM ser calculados sobre **o mesmo filtro da lista** (incluindo a busca por texto), com precedência correta entre o filtro e `done`.
- `GET /total_today` e `GET /total_rest_of_month` DEVEM manter o formato `{ "total": number }`; "resto do mês" começa amanhã, ou hoje se amanhã já for outro mês (`legacy/app/Http/Controllers/Api/BillControllerTrait.php`).

Aceite: `RN-CON-016-a-018-listagem-e-totais.json` → `totais_consistentes_com_a_lista: true` (divergência ADR-004).

### REQ-CON-13 — Segurança transversal *(adendo — aguardando aprovação)*
Origem: RN-AUT-001, RN-AUT-002, RN-AUT-003, RN-CON-019 · Decisão: **manter** os controles do legado + **corrigir** lacunas — ADR-005
Motivo: revisão de segurança `docs/revisoes/2026-09-25-security-contas.md`.

- QUANDO houver 5 tentativas de login erradas para o mesmo e-mail + IP, O SISTEMA DEVE responder **403**
  `"Too many login attempts. Please try again in 60 seconds."` por 60 s (RN-AUT-001).
- O SISTEMA DEVE limitar a API a 60 requisições/min por usuário (ou IP, sem autenticação), com cabeçalhos `X-RateLimit-*` (RN-AUT-002).
- QUANDO o usuário fizer `POST /api/logout`, O SISTEMA DEVE invalidar o token (blacklist por `jti` até o `exp`) — RN-AUT-003.
- O SISTEMA DEVE aceitar só JWT HS256 com `exp`, `nbf`, `iat`, `sub`, `jti`, de usuário existente; segredo ≥ 32 bytes obrigatório no boot.
- O SISTEMA NÃO DEVE aceitar `id`, `client_id` ou campos desconhecidos no corpo (422); `repeat_number` ≤ 120; `value` ≤ 999.999.999,99.
- Erros internos NÃO DEVEM expor tabela, coluna ou SQL; logs NÃO DEVEM conter senha, token ou cabeçalho `Authorization`.
- Todo movimento de saldo DEVE registrar o usuário e a ação que o originou (auditoria).
- QUANDO o usuário não tiver cliente, O SISTEMA DEVE recusar o login (400) e responder **403** nas rotas protegidas. *(legado: login 200 e API 500 — RN-CON-019)*

Aceite: `paridade/auth/RN-AUT-001-a-003-sessao.json` (paridade exata) + testes de segurança da T05, T06, T07, T12, T13 e T17.

---

## Fora de escopo deste módulo

- Rota pública de teste `/testasdasdasdasdasdas` e webhook Iugu — tratados nos módulos `auth` e `assinaturas`.
