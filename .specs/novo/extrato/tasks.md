Status: aprovado · Aprovado por: Francisco · Em: 2026-09-25 · Hash: fa8f9227d732

# Tasks — módulo `extrato`

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs extrato "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **E01. Domínio: consulta** — `interpretarBusca` para `shared/dominio/busca.ts` (suíte de `contas` verde); `domain/consulta.ts` com allowlist de ordenação (inclusive `date` e a chave de conta da tela) e período + testes. **REQ-EXT-03, REQ-EXT-05**.
- [ ] **E02. Repositório e serviço** — lista, contagem e totais com o mesmo `where`; 15 por página; defesa em profundidade na conta bancária. Aceite: integração (período filtra lista e totais; ordenação por data e conta com desempate; conta de outro cliente não aparece). **REQ-EXT-01, REQ-EXT-02, REQ-EXT-03, REQ-EXT-04, REQ-EXT-05**.
- [ ] **E03. HTTP e órfãos** — controller próprio, rota sai do compat; órfão (conta paga excluída) continua na lista e nos totais. Aceite: `paridade --alvo novo extrato/` (2 casos, com as divergências do ADR-008) e integração do órfão. **REQ-EXT-01, REQ-EXT-02, REQ-EXT-04, REQ-EXT-06**.
- [ ] **E04. Espelho e tela** — espelho sem a URL de período fixo; `#!/statement` em :8083 abre no mês e ordena por Data e Conta (Playwright + screenshot). **REQ-EXT-03, REQ-EXT-05**.
- [ ] **E05. Segurança e documentação** — `security-reviewer`; achados viram testes que falham antes da correção; progresso, diário, README, inventário; CI com `extrato/` no `--alvo novo`. **REQ-EXT-01**.
