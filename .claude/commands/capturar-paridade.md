---
description: Transforma regras de um módulo em casos golden master executados contra o legado
argument-hint: <modulo>
---
Para cada `RN-*` de `.specs/legado/modulos/$ARGUMENTS/regras.md` sem caso em `.specs/paridade/$ARGUMENTS/`
(`node tools/rastreabilidade.mjs` lista quais faltam):

1. Escreva `.specs/paridade/$ARGUMENTS/<RN-ID>-<slug>.json` seguindo os casos existentes como modelo:
   - `rn`, `descricao`, `usuarios` (do seed: `clienteN@user.com` / `secret`);
   - `passos`: requisições HTTP em ordem. Cada caso **cria os próprios dados** (nome com `{{execucao}}`),
     guarda ids/saldos com `salvar`, e registra só o necessário com `caminho` + `campos`
     (`"registrar": false` para passos de preparação);
   - `derivar`: expressões sobre as variáveis — use **deltas** (`saldo_depois - saldo_antes`), nunca valores absolutos do seed.
   - Nada de SQL: o caso precisa rodar igual contra o legado e contra o sistema novo.
2. Capture contra o oráculo: `node tools/paridade.mjs --capturar <RN-ID>`.
3. Leia o `esperado` gerado. Se contradisser a regra, NÃO ajuste o caso: registre em `duvidas.md`.
4. Rode de novo sem `--capturar` para confirmar que o caso é estável (deve passar em execuções repetidas).
5. Atualize o campo **Sonda** da regra em `regras.md` com o resultado e o caminho do caso.
