---
description: Extrai regras de negócio com evidência de um módulo já mapeado
argument-hint: <modulo>
---
Leia `.specs/legado/modulos/$ARGUMENTS/comportamento.md` e, via `arqueologo`, o código citado.
Acrescente em `regras.md` cada regra de negócio no formato:

### RN-<MOD>-NNN — <título curto>
- **Regra:** frase declarativa
- **Evidência:** `legacy/<arquivo>:<linha>`
- **Sonda:** requisição/consulta que demonstra a regra no oráculo (se já executada, o resultado)
- **Exemplo:** entrada → saída esperada (com números)
- **Confiança:** alta | média | baixa
- **Suspeita de bug?** sim/não + por quê

Continue a numeração existente; nunca renumere. Regras invalidadas ficam como `~~obsoleta~~` com motivo.
