# ADR-004 — Listagem e totais de contas no sistema novo

- **Status:** aceito — aprovado por Francisco em 25/09/2026 (junto com o plano, `tasks.md` hash d854ed6545ef)
- **Data:** 25/09/2026

## Contexto

O `oraculo-sql` mostrou três problemas na listagem de contas (RN-CON-016..018):

1. Sem busca (e o SPA **sempre** envia `search=`), o critério de valor BR vira `value = 0` → lista vazia.
   Isso **depende do ICU** do ambiente: no oráculo (ICU 63.1) `NumberFormatter::parse('')` devolve `0`;
   provavelmente no Heroku de 2017 devolvia `false` e a tela funcionava. O oráculo reproduz o código, mas não
   necessariamente o ambiente original.
2. `bill_data` ignora a busca por texto — os totais não batem com a lista.
3. Com busca por período, falta parênteses entre o filtro e `done`: `total_paid` soma contas não pagas.

## Decisão

- Busca vazia ou ausente → sem filtro (lista tudo do cliente).
- Mantém a semântica de busca do legado (texto OU período BR OU valor BR), sempre com E no filtro de cliente.
- Totais calculados sobre o mesmo filtro da lista, com precedência correta.
- O formato da resposta não muda (compatível com o SPA).

## Consequências

- `RN-CON-016-a-018-listagem-e-totais.json` ganha `divergencias` (já registradas, valem quando este ADR for aceito).
- Lição registrada no harness: **fixar a versão do ambiente do oráculo** (imagem `php:7.1-apache` → ICU 63.1)
  e tratar diferenças de ambiente como dúvida, não como regra.
