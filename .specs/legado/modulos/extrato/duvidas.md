# Dúvidas — módulo `extrato`

| ID | Dúvida | Evidência | Proposta | Quem responde | Status |
|---|---|---|---|---|---|
| DUV-EXT-001 | Aplicar o período que a tela envia? Hoje a tela mostra "01/09/2026 - 30/09/2026" no campo de busca, mas lista e soma **todos** os lançamentos | RN-EXT-003 | **Sim.** `search` no formato de período da tela (`dd/mm/aaaa - dd/mm/aaaa`, o mesmo parser das contas — ADR-004) filtra pela **data do lançamento**, na lista **e** nos totais. Busca sem período continua sem efeito. **Efeito visível:** a tela passa a mostrar o mês corrente, como promete | Francisco | ✅ decidido 25/09 (ADR-008) |
| DUV-EXT-002 | Fazer funcionar a ordenação por Data e por Conta (500 no legado)? | RN-EXT-005 | **Sim.** `orderBy=date` → data do lançamento; a chave de join da tela → nome da conta bancária (desempate por id); os totais não mudam com a ordenação. Fora da allowlist → 422 (como o compat já faz) | Francisco | ✅ decidido 25/09 (ADR-008) |
| DUV-EXT-003 | `?limit` no extrato: ignorar (legado, 15 fixo) ou respeitar (compat atual)? | RN-EXT-004 | **Ignorar**, fiel ao legado: o SPA não envia, e aceitar `limit` aqui só amplia a superfície (listas grandes) | — | ✅ fiel ao legado |
