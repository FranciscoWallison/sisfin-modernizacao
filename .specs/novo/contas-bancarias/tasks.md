Status: rascunho

# Tasks — módulo `contas-bancarias` (escrita + bancos)

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs contas-bancarias "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **B01. Bancos e `ASSETS_URL`** — `GET /api/banks`; `logo` com URL base configurada (também no `include=bank` do compat); `ASSETS_URL` na config validada e no compose. Aceite: `paridade --alvo novo contas-bancarias/RN-CBA-007` + espelho das rotas com `include=bank`. **REQ-CBA-07**.
- [ ] **B02. Migration e ETL** — índice único parcial `(client_id) WHERE "default"`; a checagem "padrão duplicada" do ETL já existe. Aceite: migration aplica sobre o banco migrado; `prisma migrate diff` limpo. **REQ-CBA-02**.
- [ ] **B03. DTO** — conversores movidos para `shared/http/conversoes.ts`; campos obrigatórios, `''` como ausente, booleanos do Laravel, `@Allow()` nos 5 campos da tela. Aceite: testes unitários + suíte de `contas` continua verde. **REQ-CBA-01, REQ-CBA-03, REQ-CBA-08**.
- [ ] **B04. Serviço e repositório** — criar/editar/excluir em transação: 404 para conta alheia, 422 para banco inexistente e para conta com lançamentos, troca atômica da padrão. Aceite: integração (duas criações simultâneas com `default: true` → uma padrão; excluir com lançamento → nada apagado; editar alheia não muda nada). **REQ-CBA-02, REQ-CBA-03, REQ-CBA-04, REQ-CBA-05, REQ-CBA-06**.
- [ ] **B05. HTTP** — `POST/PUT/DELETE /api/bank_accounts`. Aceite: `paridade --alvo novo contas-bancarias/` (4 casos, com as divergências do ADR-007). **REQ-CBA-01, REQ-CBA-02, REQ-CBA-03, REQ-CBA-04, REQ-CBA-05, REQ-CBA-06, REQ-CBA-08**.
- [ ] **B06. Tela** — `#!/bank-account/create` e `#!/bank-account/{id}/update` em :8083 (Playwright + screenshot). **REQ-CBA-01, REQ-CBA-08**.
- [ ] **B07. Segurança e documentação** — `security-reviewer` (foco: mass assignment com os campos ignorados, host dos links, locks); progresso, diário, README, inventário; CI com `contas-bancarias/` no `--alvo novo`. **REQ-CBA-06, REQ-CBA-07**.
