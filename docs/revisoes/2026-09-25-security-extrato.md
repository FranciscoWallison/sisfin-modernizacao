# Revisão de segurança: módulo `extrato` (E05)

- **Data:** 25/09/2026
- **Revisor:** agente `security-reviewer`, somente leitura, com conferência humana.
- **Escopo:**
  - `api/src/modules/extrato/**`;
  - `api/src/shared/dominio/periodo.ts` (parser de período extraído de `contas`);
  - a saída do extrato do `compat/`.
- **Regra do projeto:** hipótese vira teste que falha antes da correção (`api/test/extrato.integracao.spec.ts`,
  `api/test/extrato-dominio.spec.ts`).

## Resultado

**Nenhum achado alto ou médio.** Confirmado pela leitura:

- **Tenant:** `count`, `findMany` e `groupBy` passam pela extensão (que falha fechado em operação desconhecida). As três
  consultas usam o mesmo `where`, e a ordenação não entra nos totais.
- **Defesa em profundidade:** `bankAccount: { is: { clientId } }` impede que um lançamento apontando para conta de
  outro cliente apareça ou some. Provado por teste e por **mutação**: sem o filtro, o teste falha.
- **Entrada:** `orderBy` e `sortedBy` passam por allowlist, com `hasOwn` (arrays e protótipo → 422, sem ecoar a
  entrada). `page` vai de 1 a 10.000; `search` não-string não filtra nada; `limit` é ignorado.
- **Erros:** 500 genérico com id de correlação.
- **Extração do parser:** sem regressão. A regex e o `split` são idênticos aos do `busca.ts` anterior (conferido no
  `git diff`), e a suíte de `contas` está verde.
- **Compat:** sem rota duplicada.

## Achados e desfecho

| id | sev. | achado | teste antes | desfecho |
|---|---|---|---|---|
| X1 | Baixa | `search=01/12/9999 - 31/12/9999`: o "dia seguinte" do fim vira o ano 10000, e o banco recusa → **500** | ❌ 500 no extrato (contas: 200, porque lá não soma o dia seguinte) | Fim limitado a `9999-12-31T23:59:59.999Z` → 200 |
| X2 | Info | Ano 0000/0001 no período | ✅ 200 nas duas rotas — hipótese **não** confirmada | Teste fica como sensor |
| X3 | Info | O design dizia que `interpretarBusca` iria inteiro para `shared/`; foi só o parser de período | — | Registrado em "Mudanças após a aprovação" do design |
| X4 | Baixa/Info | Custo: `count` + `groupBy` do conjunto do cliente a cada página; ordenar por nome da conta ordena o conjunto inteiro antes do `OFFSET` | — | Aceito no volume atual, com o custo restrito ao próprio tenant. Se crescer: índice `(client_id, created_at)` e teto de página menor no extrato |
| X5 | Info | Links de paginação com o `Host` da requisição | — | Pendência já registrada (S10 da revisão anterior) |
