# Progresso — módulo `fluxo-de-caixa`

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 7 regras com evidência e SQL observado; 3 casos de paridade estáveis no legado | Achados: janela fixa em 2018 (tela sempre vazia), "primeiro mês" = 1 dia, corte do saldo às 00:00, isolamento depende da árvore |
| TO-BE | ✅ | requirements, ADR-006, design e tasks aprovados (hash `e486869c0978`) | |
| F01. Janelas | ✅ | `test/fluxo-dominio.spec.ts`: mês atual, `start=2018-02` reproduz o legado com o 1º mês inteiro, viradas de ano, bissexto, 6 `start` inválidos → erro | |
| F02. Montagem | ✅ | esparso/ordenado, zeros, ordem das categorias, 1º mês na frente, **RN-FLX-008 fiel** (duplicado por nome) | Achado ao portar: dedup por NOME (DUV-FLX-005) |
| F03. Repositório | ✅ | `test/fluxo.integracao.spec.ts` (Postgres): `parent_id IS NULL` ≡ profundidade 0; **árvore corrompida não vaza** (e o SQL do legado vaza os 777,77 — controle); extrato das 23h do último dia entra no saldo | |
| F04. HTTP | ✅ | **`paridade --alvo novo`: 3/3 de primeira**; resposta inteira legado × novo (`?start=2018-02`) logo após o ETL: só o 1º mês difere (ADR-006), 3/3 execuções | Empate de nome não era determinístico nos dois bancos → desempate por `id` |
| F05. Espelho e tela | ✅ | espelho **17/17** (+ `/api/cash_flows/monthly`); na tela nova, fluxo de caixa de 09/2026 a 07/2027 e o gráfico do dashboard aparecem (no legado: tabela misturando 08/2026 com 2018) | CI: paridade no novo inclui `fluxo-de-caixa/` |
| F06. Segurança | ⏳ | | revisão em andamento |
| F07. Documentação | ⏳ | | |
