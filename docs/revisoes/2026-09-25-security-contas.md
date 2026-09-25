# Revisão de segurança — módulo `contas` (specs) · 25/09/2026

- **Sensor:** subagente `security-reviewer` (inferencial, só leitura) sobre `requirements.md`, `design.md`, `contrato.md`, `regras.md`/`duvidas.md` e o código do legado.
- **Verificação humana/sonda:** os achados sobre o legado foram conferidos — `throttle:60,1` (`Kernel.php:38`), `blacklist_enabled` (`jwt.php:186`), claims `user{id,name,email}` sem `client_id` (`User.php:58-66`), `statements.client_id` (migration). Lockout e logout confirmados por sonda → `RN-AUT-001..003`.

| # | Sev. | Achado | Destino |
|---|---|---|---|
| 1 | Alta | **Corrida no saldo:** a conta não é travada nem relida dentro da transação; dois `PUT done=true` simultâneos debitariam duas vezes; contas bancárias escolhidas por um `bank_account_id` lido fora do lock | design §5 (lock da conta primeiro) + T12 (teste de concorrência) |
| 2 | Alta | **Filtro único de tenant incompleto:** extensão do Prisma não cobre `$queryRaw`, `findUnique`, `upsert`, `*Many`, `aggregate`/`groupBy`, `connect`; `statements` sem `client_id` no design | design §3, §4 + T07 |
| 3 | Alta | **Perda do lockout e do rate limit do login** que o legado tinha | RN-AUT-001/002 + REQ-CON-13 + T06 |
| 4 | Alta | **JWT:** algoritmo não fixado, claims não exigidas, revogação adiada (token de logout vale até 60 min) | design §8 + REQ-CON-13 + ADR-005 |
| 5 | Média | `client_id` não está no token do legado; origem indefinida; status para usuário sem cliente | design §4 (resolver por `sub` no banco; 403) |
| 6 | Média | Categoria por tipo (pagar → `category_expenses`, receber → `category_revenues`); `bank_account_id` novo do `PUT` validado antes dos movimentos | design §6 |
| 7 | Média | Mass assignment (`client_id`/`id` no corpo) e DoS por `repeat_number` sem teto | design §6 + REQ-CON-13 |
| 8 | Média | Dinheiro sem limite superior; parse via float do JSON | design §6 + REQ-CON-13 |
| 9 | Média | Vazamento em erros do Prisma e em logs (`DEBUG_SQL`, corpo do login) | design §10 + T05 |
| 10 | Média | Busca/ordenação: `sortedBy` sem allowlist, `%`/`_` sem escape, `search`/`page` sem limite, parâmetros Prettus (`filter`, `with`, `searchFields`, `searchJoin`) | design §7 |
| 11 | Média | Rotas `compat/` fora do sensor de camadas e do e2e de tenant | design §2 (`compat/infra`) + T07/T08 |
| 12 | Baixa | Auditoria (`user_id` nos movimentos), PII no JWT, relatórios do ETL com dados reais, CORS `*` | design §5, §9 + REQ-CON-13 |

**Resultado:** nenhum achado descartado. Os que mudam comportamento visível viraram o adendo **REQ-CON-13** e o **ADR-005** (propostos); os demais foram incorporados ao `design.md` e ao `tasks.md` (ainda em rascunho).
