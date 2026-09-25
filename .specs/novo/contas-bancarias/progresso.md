# Progresso — módulo `contas-bancarias` (escrita + bancos)

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 9 regras com evidência; 4 casos de paridade verdes no legado | Achados: a edição reenvia o objeto inteiro do GET (RN-CBA-009); quatro 500 que são validação; troca da padrão fora de transação |
| TO-BE | ✅ | requirements, ADR-007, design e tasks aprovados (hash `547b3519e39d`) | |
| B01. Bancos e `ASSETS_URL` | ✅ | `RN-CBA-007` verde no novo; espelho **20/20** com 3 URLs novas (`/api/banks` para os 2 clientes e `/api/bank_accounts/{id}?include=bank`); `ASSETS_URL` validada no boot (5 asserções em `formato-http.e2e-spec.ts`) | **Achado:** o `GET /:id` do compat ignorava `include=bank`, e a tela de edição quebraria. Nenhum caso pegava isso |
| B02. Migration e ETL | ✅ | Migration manual do índice parcial. `prisma migrate diff` (migrations × schema e banco × schema): **sem diferença**. ETL: "padrão duplicada" = 0. O banco recusa a 2ª padrão (P2002, com teste) | |
| B03. DTO | ✅ | `test/contas-bancarias-dto.spec.ts` (17), com o pipe real: objeto inteiro do GET aceito, `client_id` → 422, `''` → required, booleanos do Laravel. Conversores em `shared/http/conversoes.ts` (suíte de `contas` verde) | |
| B04. Serviço e repositório | ✅ | `test/contas-bancarias.integracao.spec.ts` (7): troca de padrão; **6 criações simultâneas → uma padrão**; índice recusa duplicata; B → 404 e linha idêntica; `balance` ignorado; lançamento bloqueia exclusão; banco inexistente → 422. **Mutação:** sem o advisory lock, falha em 4 de 4 | Advisory lock além do lock de linhas: sem padrão atual, não há linha para travar |
| B05. HTTP | ✅ | **`paridade --alvo novo contas-bancarias/`: 4/4** | |
| B06. Tela | ✅ | Criar (autocomplete com `/api/banks`, `POST` 201) e editar (**o objeto inteiro do GET vai no `PUT`** → 200, como previsto na RN-CBA-009) em :8083. `docs/imgs/spa-novo-conta-bancaria-editar.png` | |
| B07. Segurança e documentação | ✅ | Mesma revisão da G06 (S2–S5, S8, S11); docs e CI atualizados | |

## Resultado do módulo

- Paridade no sistema novo: **4/4**; espelho **20/20** (com `/api/banks` e a URL real da tela de edição).
- Divergências intencionais (ADR-007):
  - `bank_id` inexistente → 422;
  - conta com lançamentos → 422;
  - troca da conta padrão atômica.
