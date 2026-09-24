---
description: Transforma regras de um módulo em casos golden master executados contra o legado
argument-hint: <modulo>
---
Para cada `RN-*` de `.specs/legado/modulos/$ARGUMENTS/regras.md` sem caso em `.specs/paridade/$ARGUMENTS/`:

1. Escreva um caso `.specs/paridade/$ARGUMENTS/<rn-id>-<slug>.json` com: `rn`, `descricao`,
   `setup` (usuário do seed, dados necessários), `passos` (requisições HTTP em ordem),
   `verificar` (campos da resposta e consultas SQL de estado: saldo, extrato, linhas criadas)
   e `ignorar` (campos voláteis: ids, created_at, updated_at, token).
2. Execute contra o oráculo (http://localhost:8081, MySQL em localhost:33061) e grave a saída em `esperado`.
3. Se o resultado contradisser a regra, NÃO ajuste o caso: registre em `duvidas.md`.
