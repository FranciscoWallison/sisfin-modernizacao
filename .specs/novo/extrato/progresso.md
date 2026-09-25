# Progresso — módulo `extrato`

> O `tasks.md` fica imutável depois de aprovado (hash). O andamento fica aqui.

| Task | Status | Evidência de aceite | Observações |
|---|---|---|---|
| AS-IS | ✅ | 7 regras (código, tela, sondas lado a lado, `laravel.log`); 2 casos de paridade estáveis no legado | Achados: a tela promete o mês e mostra tudo; Data e Conta → 500; `limit` ignorado |
| TO-BE | ✅ | requirements, ADR-008, design e tasks aprovados (hash `fa8f9227d732`) | |
| E01. Domínio: consulta | ✅ | `test/extrato-dominio.spec.ts` (24): allowlist com `date` e a chave de conta da tela, 422 para chave inválida/protótipo/array, período (formato da tela, virada de ano, datas inexistentes, fim antes do início, ano 9999). Suíte de `contas` verde depois da extração do parser | Só o parser de período foi para `shared/` (design, mudanças) |
| E02. Repositório e serviço | ✅ | `test/extrato.integracao.spec.ts`: período filtra lista **e** totais; ordem por data, conta e valor **igual à do Postgres** com desempate; ordenação não altera totais; `limit` ignorado; conta bancária de outro cliente não aparece nem soma. **Mutação:** sem o filtro da conta bancária, o teste falha | |
| E03. HTTP e órfãos | ✅ | **`paridade --alvo novo extrato/`: 2/2**; o órfão continua listado (com o estorno do ADR-003); a rota saiu do compat | |
| E04. Espelho e tela | ✅ | Espelho **20/20** (sem a URL de período fixo); `#!/statement` em :8083 abre com o período do mês e **ordena por Conta e por Data** (200; no legado, 500). `docs/imgs/spa-novo-extrato-ordenado.png` | |
| E05. Segurança e documentação | ✅ | `docs/revisoes/2026-09-25-security-extrato.md`: 0 altos/médios; X1 (ano 9999 → 500) corrigido com teste vermelho antes; X2 não se confirmou (fica como sensor). CI com `extrato/` | |

## Resultado do módulo

- Paridade no sistema novo: **2/2** (24/24 somando todos os módulos, nos dois alvos); espelho **20/20**; 300+ testes.
- Divergências intencionais (ADR-008): o período da tela filtra lista e totais; Data e Conta ordenam.
- **Toda a API do legado está no sistema novo**, exceto o webhook da Iugu (módulo assinaturas).
