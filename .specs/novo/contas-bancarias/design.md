Status: rascunho — aguardando aprovação do Francisco

# Design — módulo `contas-bancarias` (escrita + bancos) — TO-BE

> Implementa `requirements.md` (REQ-CBA-01..08). Reaproveita a fundação e a leitura já existente em `compat/`.
> Contrato: `.specs/legado/modulos/contas-bancarias/contrato.md`. Correções: ADR-007 (proposto).

## 1. Estrutura (`api/src/modules/contas-bancarias/`)

```text
infra/
  contas-bancarias.repositorio.ts   via PRISMA_TENANT (BankAccount tem tenant); Bank sem tenant (lista global)
application/
  contas-bancarias.service.ts       criar / editar / excluir numa transação
http/
  conta-bancaria.dto.ts             name, agency, account, bank_id, default + campos da tela ignorados
  contas-bancarias.controller.ts    POST/PUT/DELETE /api/bank_accounts, GET /api/banks
```

A leitura (`GET /api/bank_accounts`, `/lists`, `/:id`) continua no `compat/`, que passa a usar a mesma serialização
de banco (`ASSETS_URL`). Não há regra de domínio pura que justifique `domain/`. O módulo é um CRUD com duas regras
transacionais.

## 2. Escritas (application)

```text
criar/editar:
BEGIN
  PUT: SELECT … FROM bank_accounts WHERE id = $id AND client_id = $c FOR UPDATE → não achou: 404   -- REQ-CBA-06
  bank_id: SELECT 1 FROM banks WHERE id = $bank → não achou: 422 bank_id                           -- REQ-CBA-04
  se default = true:
    SELECT id FROM bank_accounts WHERE client_id = $c AND "default" FOR UPDATE                     -- lock das padrão
    UPDATE bank_accounts SET "default" = false WHERE client_id = $c AND "default" AND id <> $id    -- REQ-CBA-02
  INSERT / UPDATE (só name, agency, account, bank_id, default — balance nunca)                    -- REQ-CBA-03
COMMIT

excluir:
BEGIN
  SELECT … WHERE id = $id AND client_id = $c FOR UPDATE → 404
  existe bill_pays / bill_receives / statements com bank_account_id = $id → 422 message           -- REQ-CBA-05
  DELETE
COMMIT
```

- **Índice único parcial:** `CREATE UNIQUE INDEX bank_accounts_um_padrao ON bank_accounts (client_id) WHERE "default"`
  (migration nova). É a rede de segurança da REQ-CBA-02. Uma violação (P2002) vira 409, pelo filtro de erros que já
  existe. Hoje nenhum cliente do oráculo tem duas padrão (consulta de 25/09). O ETL ganha a checagem para a migração
  não quebrar no meio.
- **Ordem de locks:** o módulo `contas` trava contas bancárias por id (`FOR UPDATE`) ao lançar pagamento.
  - Editar: trava primeiro a conta editada, depois as padrão. Uma padrão diferente da editada é travada depois,
    sempre na ordem de id (`ORDER BY id`).
  - Um 40P01 residual vira 409, como já acontece em `contas`.
- **FK como segunda barreira:** se um lançamento entrar entre a checagem e o DELETE, o P2003 vira o mesmo 422.

## 3. HTTP

| Rota | Resposta |
|---|---|
| `GET /api/banks` | `{ data: [...] }`, ordem de id, sem paginação, sem tenant |
| `POST /api/bank_accounts` | 201 com a conta (formato da leitura, sem `bank`) |
| `PUT /api/bank_accounts/:id` | 200 |
| `DELETE /api/bank_accounts/:id` | 204 |

- **DTO:**
  - `name`, `agency`, `account`: `IsString`, `IsNotEmpty`, `MaxLength(255)`;
  - `bank_id`: inteiro obrigatório, `''` → mensagem `required` (converter `''` em ausente antes de validar);
  - `default`: booleano opcional, aceitando `true/false/0/1/'0'/'1'` como o `boolean` do Laravel;
  - `@Allow()` e descarte de `id`, `balance`, `created_at`, `updated_at`, `bank` (REQ-CBA-08). Qualquer outro campo
    continua dando 422;
  - os conversores `paraNumero`/`paraBooleano` do DTO de `contas` vão para `shared/http/conversoes.ts`, para os dois
    módulos usarem.
- **`logo`:** `${ASSETS_URL}/storage/banks/imagens/${arquivo}`, com `ASSETS_URL` na configuração validada (URL
  http/https obrigatória em produção). No compose: `ASSETS_URL: http://localhost:8081`, porque os arquivos moram no
  storage do legado durante o strangler. O espelho continua igual (mesmo host). Nota: no ambiente de estudo os arquivos
  de logo não existem nem no legado (o seed não os cria), então a imagem sai quebrada nas duas telas.

## 4. Testes

| Nível | O quê |
|---|---|
| Unitário | DTO (obrigatórios, `''`, booleanos do Laravel, campos da tela ignorados, campo extra → 422), montagem do `logo` |
| Integração (Postgres) | troca de padrão; **duas criações simultâneas com `default: true` → exatamente uma padrão**; editar conta alheia não muda nada; excluir com lançamento → 422 e nada apagado; `balance` do corpo ignorado |
| Paridade | `contas-bancarias/*.json` com `--alvo novo` (4 casos) |
| Espelho | rotas com `include=bank` sem diferença depois de trocar para `ASSETS_URL` |
| Tela | `#!/bank-account/create` e `…/update` em :8083 (Playwright + screenshot) |

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Whitelist global recusar o corpo da tela de edição | `@Allow()` explícito nos 5 campos + caso de paridade `RN-CBA-009` com o objeto real do GET |
| Índice único falhar na migração por dado legado | Checagem no ETL antes (relatório); hoje 0 casos |
| Deadlock com o lançamento de contas (`contas` trava a conta bancária) | Mesma ordem (conta por id) + 40P01 → 409 |
