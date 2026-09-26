# ADR-010 — Admin de bancos: API de admin + telas no `web/`, com a criação e a edição que nunca funcionaram

- **Status:** aceito — aprovado — Francisco, 26/09/2026 (com o plano, hash bb0f9a303b2e)
- **Data:** 26/09/2026

## Contexto

O levantamento (`.specs/legado/modulos/admin-bancos/`) mostrou um admin que, na prática, quase não existe:

- **Em Linux, tudo dá 500:** as views estão em `Admin/` e o código pede `admin.` (RN-ADB-001).
- **Mesmo no ambiente do autor, criar e editar banco sempre dão 500:** as classes de validação não existem
  (RN-ADB-003). Os bancos vêm só do seeder.
- **O que funciona:** a listagem e a exclusão de banco sem uso. Com uso, a exclusão dá 500 (RN-ADB-004).
- **Sob `/admin`, o legado ainda expõe:**
  - um **cadastro público** que cria usuários sem cliente (RN-ADB-005);
  - uma **recuperação de senha** cujo link do e-mail dá 404 (RN-ADB-006).
- **Os logos moram no storage do legado** e, no ambiente de estudo, nem existem (RN-ADB-007).

O caminho do ADR-009 continua: API nova + telas no `web/`, login único por JWT.

## Decisão

1. **API de admin** (`/api/admin/banks`), só para `role = admin` (403 para os outros, 401 sem token):
   - listar, paginado em 5 como o legado;
   - criar, editar e excluir.
2. **Criar e editar passam a existir** (DUV-ADB-001): nome + logo, com o upload validado (DUV-ADB-003):
   - só PNG, JPEG ou WebP, reconhecidos pelo **conteúdo**, até 1 MB;
   - nome de arquivo aleatório;
   - nunca sobrescrever arquivo de outro banco nem o padrão;
   - o arquivo antigo é removido quando o banco troca de logo.
3. **Logos num volume próprio** (DUV-ADB-002):
   - gravados pela API e servidos pelo nginx da `:8083` no **mesmo caminho** do legado (`/storage/banks/imagens/`);
   - arquivo ausente → imagem padrão (fim da imagem quebrada);
   - `ASSETS_URL` aponta para a `:8083`;
   - `tools/migrar-logos.mjs` copia os arquivos existentes no cutover e relata os ausentes.
4. **Excluir banco em uso** → 422 `{"message":"Bank has bank accounts."}` (DUV-ADB-004).
5. **Não migrados:** `/admin/register` público (DUV-ADB-005) e a recuperação de senha quebrada (DUV-ADB-006). A
   recuperação de verdade vira proposta de produto.
6. **Telas no `web/`:** `/admin/banks` (lista, novo, editar, excluir). O acesso é pelo login único, e o link aparece
   para admin em "Minha conta".

## Consequências

- **Paridade HTTP não se aplica:** as regras têm "Paridade: n/a" com a task que as cobre. O aceite é por integração
  (API + banco + volume) e E2E (telas). O `GET /api/banks` (RN-CBA-007) continua coberto pela paridade existente.
- **Espelho:** com `ASSETS_URL` na `:8083`, o logo sai com outra origem. O espelho normaliza também essa origem, que é
  a mesma já normalizada para os links de paginação.
- **Ambiente do oráculo:** a imagem do legado ganhou o link `views/admin → Admin` para sondar a regra pretendida
  (documentado no Dockerfile e na RN-ADB-001).
- **Não migrado, mas no radar:** o `Admin\HomeController`, o painel do admin, que não tem regra de negócio (só a
  página inicial).
