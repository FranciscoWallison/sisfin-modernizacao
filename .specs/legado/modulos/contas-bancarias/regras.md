# Regras de negócio — módulo `contas-bancarias` (escrita + bancos) — AS-IS

> Levantadas em 25/09/2026: leitura de `legacy/app/Http/Controllers/Api/BankAccountsController.php`,
> `BanksController.php`, `legacy/app/Http/Requests/BankAccountCreateRequest.php` (o `UpdateRequest` herda as mesmas
> regras), `legacy/app/Models/BankAccount.php`, `legacy/app/Listeners/BankAccountSetDefaultListener.php` e
> `legacy/app/Providers/EventServiceProvider.php`; sondas no oráculo e casos em `.specs/paridade/contas-bancarias/`.
> A LEITURA (`GET /api/bank_accounts`, `/lists`, `/{id}`, `include=bank`) já existe no sistema novo (`api/src/compat/`).

### RN-CBA-001 — Criar e editar: `name`, `agency`, `account`, `bank_id` obrigatórios; saldo começa em 0
- **Regra:** `POST` → 201; `PUT` → 200. `name`, `agency`, `account` required (máx. 255), `bank_id` required,
  `default` boolean (opcional, padrão `false`). Conta nova tem `balance: 0`. Resposta = mesmo formato da leitura.
- **Evidência:** `BankAccountCreateRequest.php:24-34`; `BankAccount.php:15-21` (`fillable`)
- **Sonda:** `RN-CBA-001-padrao-e-isolamento.json` (`criar_padrao` 201 com `balance: 0`); `RN-CBA-003-a-005…`
  (`sem_campos` 422 com as quatro mensagens `required`) ✅
- **Confiança:** alta

### RN-CBA-002 — No máximo UMA conta padrão por cliente
- **Regra:** criar ou editar uma conta com `default: true` **desmarca** a padrão anterior do mesmo cliente. Desmarcar a
  padrão deixa o cliente **sem** nenhuma (não há "promoção" automática). Contas de outros clientes não são tocadas.
- **Evidência:** `BankAccountSetDefaultListener.php:31-53` (ouve `RepositoryEntityCreated`/`Updated` — `EventServiceProvider.php:29-37`);
  `findByField('default', true)` passa pelo escopo de tenant (`BelongsToTenants`)
- **Sonda:** `RN-CBA-001` (`uma_padrao_apos_criar`, `padrao_troca_para_a_segunda`, `nenhuma_padrao_apos_desmarcar`,
  `padroes_de_b_intactos` — todos `true`) ✅
- **Confiança:** alta · **Observação:** a troca acontece num listener DEPOIS do save, fora de transação — duas criações
  simultâneas com `default: true` podem deixar duas padrão (não sondado; DUV-CBA-003)

### RN-CBA-003 — `balance` no corpo é IGNORADO em silêncio
- **Regra:** `balance` não é `fillable`: enviado no `POST`/`PUT`, é descartado sem erro. O saldo só muda pelas contas
  pagas/recebidas (módulo `contas`, RN-CON-*).
- **Evidência:** `BankAccount.php:15-21` (`fillable` sem `balance`)
- **Sonda:** `RN-CBA-003-a-005…` (`balance_no_corpo`: 201 com `balance: 0` após enviar 1.000.000) ✅
- **Confiança:** alta · **Nota:** a tela de edição SEMPRE envia `balance` (RN-CBA-009) — rejeitar quebraria a tela

### RN-CBA-004 — `bank_id` inexistente → 500
- **Regra:** a validação só exige presença; um `bank_id` que não existe estoura a FK → **500**.
- **Evidência:** `BankAccountCreateRequest.php:32` (`'bank_id' => 'required'`, sem `exists`)
- **Sonda:** `RN-CBA-003-a-005…` (`bank_id_inexistente` 500) ✅
- **Confiança:** alta · **Suspeita de bug?** sim — deveria ser 422 (DUV-CBA-001)

### RN-CBA-005 — Excluir: conta vazia → 204; conta com lançamentos → 500
- **Regra:** `DELETE` de conta sem contas a pagar/receber nem extrato → 204. Com qualquer lançamento → **500** (FK) e
  nada é apagado.
- **Sonda:** `RN-CBA-003-a-005…` (`excluir_com_lancamento` 500, `continua_existindo` 200, `excluir_vazia` 204,
  `vazia_sumiu` 404) ✅
- **Confiança:** alta · **Suspeita de bug?** 500 em vez de 422 (DUV-CBA-001)

### RN-CBA-006 — Isolamento: outro cliente não lê, não edita, não exclui
- **Regra:** `GET`/`PUT`/`DELETE` em conta de outro cliente → 404 e **nada muda** (diferente das categorias: aqui o
  escopo de tenant é global e nunca é desligado).
- **Evidência:** `BankAccount.php:13` (`use BelongsToTenants`)
- **Sonda:** `RN-CBA-001` (`b_le`/`b_edita`/`b_exclui` 404; `a_ve_a_sua` inalterada; `padroes_de_b_intactos`) ✅
- **Confiança:** alta

### RN-CBA-007 — `GET /api/banks`: lista GLOBAL, ordem de id, logo com URL absoluta
- **Regra:** a mesma lista para qualquer cliente (bancos não têm `client_id`), sem paginação, em ordem de id. Cada banco:
  `id`, `name`, `logo` = `<url base>/storage/banks/imagens/<arquivo>`, `created_at`/`updated_at` no formato Carbon.
  Usada pelo autocomplete das telas de criar/editar conta bancária.
- **Evidência:** `BanksController.php:25-27` (`repository->all()`), `Transformers/BankTransformer.php:21-40` (`makeLogoPath`)
- **Sonda:** `RN-CBA-007-bancos-e-put-completo.json` (`bancos_iguais_para_todos_os_clientes`, `logo_em_storage`,
  `bancos_em_ordem_de_id`) ✅
- **Confiança:** alta

### RN-CBA-008 — `PUT` exige TODOS os campos (não é PATCH)
- **Regra:** o `UpdateRequest` herda as regras do `CreateRequest` → um `PUT` só com `name` → 422.
- **Evidência:** `BankAccountUpdateRequest.php` (classe vazia que estende `BankAccountCreateRequest`)
- **Sonda:** `RN-CBA-007-…` (`put_so_com_nome` 422) ✅
- **Confiança:** alta

### RN-CBA-009 — Corpo que a tela envia: a edição reenvia o OBJETO INTEIRO do GET
- **Regra:** a tela de edição carrega `GET /api/bank_accounts/{id}?include=bank` e devolve **esse objeto** no `PUT`:
  `id`, `name`, `agency`, `account`, `balance`, `default`, `bank_id`, `created_at`, `updated_at` e `bank`
  (`{ data: {…} }`). O legado aceita e usa só o `fillable`. A criação envia `bank_id: ''` quando o usuário não escolheu
  banco → 422 `required`.
- **Evidência:** `legacy/resources/assets/spa/js/components/bank-account/BankAccountUpdate.vue:36-60`
  (`this.bankAccount = response.data.data` … `BankAccount.update({id}, this.bankAccount)`); `BankAccountCreate.vue:16-22`
- **Sonda:** `RN-CBA-009-corpo-da-tela.json` (`salvar_objeto_inteiro` 200; `criar_sem_escolher_banco` 422) ✅
- **Confiança:** alta · **Impacto no novo:** a whitelist global (`forbidNonWhitelisted`) recusaria o corpo → a tela de
  edição quebraria
