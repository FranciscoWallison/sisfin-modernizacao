# Dúvidas — módulo `fluxo-de-caixa`

| ID | Dúvida | Evidência | Proposta | Quem responde | Status |
|---|---|---|---|---|---|
| DUV-FLX-001 | Qual deve ser a janela de `/api/cash_flows`? | RN-FLX-002 (fixa em 2018); a tela espera "primeiro mês = mês anterior a hoje" | Início = **mês atual** (UTC), fim = +10 meses, como a largura original; parâmetro opcional `?start=aaaa-mm` para navegar (e para comparar com o legado na janela de 2018) | Francisco | ✅ decidido 25/09 (ADR-006) |
| DUV-FLX-002 | O "primeiro mês" deveria ser o mês anterior **inteiro** (só pagas)? | RN-FLX-004 (só o último dia) | Sim: mês anterior inteiro, só pagas (15 no caso de teste, não 5) | Francisco | ✅ decidido 25/09 (ADR-006) |
| DUV-FLX-003 | O corte do saldo anterior deveria incluir o último dia inteiro? | RN-FLX-006 (`<= 'aaaa-mm-dd'` = 00:00) | Sim: `created_at < primeiro dia do mês seguinte` | Francisco | ✅ decidido 25/09 (ADR-006) |
| DUV-FLX-004 | O filtro de cliente deve valer também para as filhas e as contas? | RN-FLX-007 | Sim (defesa em profundidade): `client_id` em raiz, filhas e contas — mesmo resultado com árvore íntegra | Francisco | ✅ decidido 25/09 (ADR-006) |
| DUV-FLX-005 | Categorias raiz com o **mesmo nome**: a segunda some de `categories_period` (o total do mês continua certo). Corrigir agrupando por id? | RN-FLX-008 | Sim: agrupar por `id` — a tabela por categoria passa a somar o total do mês | Francisco | ⏳ decidir (até lá, fiel ao legado) |
