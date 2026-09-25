Status: aprovado — Francisco, 25/09/2026 (com o plano, hash 547b3519e39d). Mudanças posteriores no fim do arquivo.

# Requirements — módulo `contas-bancarias` (escrita + bancos) — TO-BE

> Gerado de `.specs/legado/modulos/contas-bancarias/regras.md` (RN-CBA-001..009) e `duvidas.md` (DUV-CBA-001..005).
> Contrato a preservar: `contrato.md` do módulo. Correções: ADR-007 (aceito).
> Aceite: `.specs/paridade/contas-bancarias/` com `--alvo novo` (divergências do ADR-007 registradas nos casos).

### REQ-CBA-01 — Criar e editar
Origem: RN-CBA-001, RN-CBA-008 · Decisão: **manter**

- `POST` → 201 e `PUT` → 200, com a conta no formato da leitura. `name`, `agency` e `account` são obrigatórios
  (máx. 255), `bank_id` é obrigatório (`''` conta como ausente) e `default` é booleano opcional (padrão `false`).
- O `PUT` DEVE exigir todos os campos obrigatórios, como o `POST` (não é PATCH).
- Conta nova DEVE começar com `balance` 0.

Aceite: `RN-CBA-001` (`criar_padrao`), `RN-CBA-003-a-005` (`sem_campos`), `RN-CBA-007` (`put_so_com_nome`),
`RN-CBA-009` (`criar_sem_escolher_banco`).

### REQ-CBA-02 — No máximo uma conta padrão por cliente, também sob concorrência
Origem: RN-CBA-002 · Decisão: **manter** o comportamento e **corrigir** a corrida — ADR-007

- QUANDO uma conta for criada ou editada com `default: true`, O SISTEMA DEVE desmarcar a padrão anterior do cliente
  **na mesma transação**. Desmarcar deixa o cliente sem padrão. Outros clientes não são tocados.
- O banco DEVE garantir no máximo uma padrão por cliente (índice único parcial).

Aceite: `RN-CBA-001` (quatro derivados `true`); integração: duas criações simultâneas com `default: true` → uma padrão.

### REQ-CBA-03 — `balance` do corpo é ignorado
Origem: RN-CBA-003 · Decisão: **manter** (a tela de edição sempre envia `balance`)

- O SISTEMA DEVE ignorar `balance` no `POST`/`PUT`. O saldo só muda por lançamentos (módulo `contas`).

Aceite: `RN-CBA-003-a-005` (`balance_no_corpo` com `balance: 0`), `RN-CBA-009` (`salvar_objeto_inteiro`).

### REQ-CBA-04 — `bank_id` inexistente → 422
Origem: RN-CBA-004 · Decisão: **corrigir** — ADR-007

- QUANDO o `bank_id` não existir, O SISTEMA DEVE responder 422 `{"bank_id":["The selected bank id is invalid."]}`.
  *(legado: 500)*

Aceite: `RN-CBA-003-a-005` → `bank_id_inexistente` 422 (divergência ADR-007).

### REQ-CBA-05 — Exclusão: conta com lançamentos → 422
Origem: RN-CBA-005 · Decisão: **corrigir** — ADR-007

- Conta sem contas a pagar/receber nem extrato → 204.
- Com qualquer lançamento → 422 `{"message":"Bank account has entries."}`, sem apagar nada. *(legado: 500)*

Aceite: `RN-CBA-003-a-005` → `excluir_com_lancamento` 422, `continua_existindo` 200, `excluir_vazia` 204.

### REQ-CBA-06 — Isolamento
Origem: RN-CBA-006 · Decisão: **manter**

- Conta de outro cliente → 404 em `GET`/`PUT`/`DELETE`, sem gravar nada.

Aceite: `RN-CBA-001` (`b_le`, `b_edita`, `b_exclui`, `a_ve_a_sua`, `padroes_de_b_intactos`).

### REQ-CBA-07 — `GET /api/banks`
Origem: RN-CBA-007 · Decisão: **manter** o formato; **corrigir** a origem do host — ADR-007

- O SISTEMA DEVE listar todos os bancos (lista global), em ordem de id, sem paginação, no formato do contrato.
- `logo` DEVE ser `<ASSETS_URL>/storage/banks/imagens/<arquivo>`, com `ASSETS_URL` vindo da configuração e não do
  `Host` da requisição. Vale também para o `include=bank` da leitura.

Aceite: `RN-CBA-007-bancos-e-put-completo.json`; espelho das rotas com `include=bank`.

### REQ-CBA-08 — Corpo que a tela envia
Origem: RN-CBA-009 · Decisão: **manter**

- O SISTEMA DEVE aceitar e ignorar `id`, `balance`, `created_at`, `updated_at` e `bank` no corpo (a edição reenvia
  o objeto do `GET …?include=bank`). Qualquer outro campo desconhecido → 422.

Aceite: `RN-CBA-009-corpo-da-tela.json` (`salvar_objeto_inteiro` 200).
