# Revisão de segurança — módulo `contas` (CÓDIGO) · 25/09/2026

- **Sensor:** subagente `security-reviewer` (inferencial, só leitura) sobre `api/src` e `api/test`, conferindo também os
  12 achados da revisão das specs (`2026-09-25-security-contas.md`).
- **Regra aplicada:** cada achado marcado como hipótese foi **provado por um teste que falha antes da correção** e passa depois.

## Achados da revisão das specs

Os 12 foram confirmados como implementados no código (débito duplo, tenant por operação, JWT, origem do cliente,
categoria por tipo, mass assignment, limites de dinheiro, erros/logs, busca, compat, auditoria/CORS).

## Achados desta revisão e destino

| # | Sev. | Achado | Prova (antes → depois) | Destino |
|---|---|---|---|---|
| 1 | Média | **Deadlock** entre criações simultâneas: a conta era gravada antes do `FOR UPDATE` nas contas bancárias (lock de FK → upgrade) | 8 criações pagas paralelas: `40P01 deadlock detected` → 8 débitos, 3/3 execuções | ✅ Contas bancárias travadas **antes** de gravar; `P2034`/`40P01`/`40001` → 409 |
| 2 | Média | Rate limit contornado por **caixa do caminho** (`/API/…`) | `x-ratelimit-limit` ausente → presente | ✅ Caminho comparado em minúsculas |
| 3 | Média | **Corrida no lockout**: `await bcrypt` entre checar e contar | 10 tentativas paralelas: 10× 400 → 5× 400 + 5× 403 | ✅ `reservar()` conta a tentativa antes do `await`; login limitado sempre por IP |
| 4 | Média | Escrita aninhada além de `connect` e FKs sem `client_id` | teste por operação aninhada (create/update/upsert/delete/updateMany) | ✅ Qualquer objeto de relação no `data` é proibido; ✅ ETL verifica referências cruzadas entre clientes (prova: registro corrompido detectado). ⏳ FK composta / RLS — pendente |
| 5 | Média | Faltava e2e A × B **pelas rotas HTTP** | — | ✅ `test/contas-tenant.integracao.spec.ts` (7): leitura/edição/exclusão 404, refs de outro cliente 422, busca e `bill_data`, `total_today`, extrato, lists, categorias, includes |
| 6 | Baixa | Blacklist de logout só em memória | — | ⏳ Pendente (Redis/tabela antes de ter 2 instâncias) — já registrado no ADR-005 |
| 7 | Baixa | Log de erro do Prisma com argumentos da query (PII) | — | ✅ Para erros do Prisma, só nome e código no log |
| 8 | Baixa | `date_due` inexistente (`2026-02-31`) → 500 | 4 datas inválidas → 422 | ✅ Validador de data real |
| 9 | Baixa | `orderBy=constructor` passava pela allowlist (`in` olha o protótipo) → 500 | → 422 | ✅ `Object.hasOwn` |
| 10 | Baixa | Busca numérica gigante → `"1e+99.00"` → 500 | 20 dígitos → filtro de valor ignorado | ✅ Teto na busca |
| 11 | Baixa | Segredo JWT de desenvolvimento no compose com `NODE_ENV=production`; `iss` vindo do cabeçalho `Host` | segredo de exemplo em produção → boot recusado; `iss` forjado → 401 | ✅ Compose em `development`; boot recusa segredo de exemplo em produção; `iss` fixo (`sisfin-api`) e verificado |

## Pendências registradas (não bloqueiam o módulo, bloqueiam produção com escala)

- **FK composta `(client_id, id)` ou RLS** para o banco garantir o mesmo tenant nas referências (hoje: aplicação + checagem do ETL).
- **Blacklist, lockout e rate limit em store compartilhado** (Redis) antes de mais de uma instância.
- **`trust proxy`** com a lista exata de proxies quando houver balanceador na frente (hoje não há; `req.ip` é o IP real).
