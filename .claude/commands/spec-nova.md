---
description: Gera requirements/design/tasks do TO-BE a partir das regras AS-IS
argument-hint: <modulo>
---
Com base em `.specs/legado/modulos/$ARGUMENTS/regras.md`, `duvidas.md` e `.specs/paridade/$ARGUMENTS/`:

1. `.specs/novo/$ARGUMENTS/requirements.md`: um requisito `REQ-<MOD>-NN` por regra (ou grupo coeso),
   critérios em EARS (QUANDO … O SISTEMA DEVE …), com `Origem: RN-...` e `Decisão: manter | corrigir | descartar`.
   Dúvidas abertas bloqueiam os requisitos que dependem delas — marque `Bloqueado por: DUV-...`.
2. PARE e peça aprovação do requirements antes de seguir.
3. `design.md`: módulos NestJS, contratos da API (compatíveis com o legado, salvo decisão contrária),
   modelo Prisma, migração de dados MySQL → Postgres, isolamento de tenant, transações, ADRs necessários.
4. PARE e peça aprovação do design.
5. `tasks.md`: tarefas pequenas, cada uma com `REQ-*` e o(s) caso(s) de paridade que a aceitam.
   Primeira linha: `Status: rascunho`.
6. Acione `security-reviewer` sobre requirements e design.
