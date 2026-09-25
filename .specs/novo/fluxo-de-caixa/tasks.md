Status: rascunho

# Tasks — módulo `fluxo-de-caixa`

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs fluxo-de-caixa "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **F01. Domínio: janelas** — `domain/janela.ts` + testes (mês atual, `start`, virada de ano, 422, primeiro mês inteiro, corte do saldo). **REQ-FLX-01, REQ-FLX-02, REQ-FLX-04, REQ-FLX-06**.
- [ ] **F02. Domínio: montagem** — `domain/montagem.ts` + testes (períodos esparsos e ordenados, zeros, categorias por raiz, primeiro mês na frente). **REQ-FLX-03, REQ-FLX-05**.
- [ ] **F03. Repositório** — `infra/fluxo.repositorio.ts` com SQL agregado e `clientId` nas três tabelas; saldo anterior pelo último extrato. Aceite: integração no Postgres — árvore corrompida de propósito não vaza; extrato do último dia entra no corte. **REQ-FLX-06, REQ-FLX-07**.
- [ ] **F04. HTTP** — controller com `@ComCliente()`, `?start=` validado. Aceite: `paridade --alvo novo` em `fluxo-de-caixa/*` (3 casos). **REQ-FLX-01, REQ-FLX-02, REQ-FLX-03, REQ-FLX-04, REQ-FLX-05**.
- [ ] **F05. Espelho e tela** — `/api/cash_flows/monthly` no espelho; `#!/cash-flow` e gráfico do dashboard funcionando em :8083 (Playwright + screenshot). **REQ-FLX-01, REQ-FLX-02**.
- [ ] **F06. Segurança** — `security-reviewer` no código do módulo; achados viram testes que falham antes da correção. **REQ-FLX-07**.
- [ ] **F07. Documentação** — progresso, diário, README, inventário.
