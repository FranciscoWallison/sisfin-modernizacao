Status: rascunho — aguardando aprovação do Francisco

# Requirements — módulo `admin-bancos` — TO-BE

> Gerado de `.specs/legado/modulos/admin-bancos/regras.md` (RN-ADB-001..007) e `duvidas.md` (DUV-ADB-001..007).
> Decisões: ADR-010 (proposto). Aceite: integração (API + banco + volume) e E2E das telas; `GET /api/banks` segue na
> paridade de `contas-bancarias`.

### REQ-ADB-01 — Listagem para o admin
Origem: RN-ADB-001, RN-ADB-002 · Decisão: **manter** a listagem (5 por página, ordem de id); **corrigir** o 500 de ambiente

- `GET /api/admin/banks?page=N` DEVE devolver os bancos em páginas de 5, em ordem de id, no formato do `GET /api/banks`
  (com `logo` absoluto), mais a paginação no formato das outras listas.

Aceite: integração (5 por página; página 2; logo absoluto).

### REQ-ADB-02 — Só admin
Origem: RN-ADB-002, RN-ADB-005 · Decisão: **manter** o gate; **não migrar** o cadastro público do `/admin` — ADR-010

- Toda rota `/api/admin/*` DEVE exigir token válido (401) e `role = admin` (403 para os outros, **sem** executar nada).
- O sistema novo NÃO DEVE ter cadastro de usuário sem cliente.

Aceite: integração (sem token → 401; cliente comum → 403 em listar, criar, editar e excluir, sem gravar); E2E
(`/admin/register` → "não encontrada").

### REQ-ADB-03 — Criar e editar banco
Origem: RN-ADB-003 · Decisão: **implementar a intenção** (nunca funcionou) — ADR-010 (DUV-ADB-001)

- `POST /api/admin/banks` (multipart: `name`, `logo` opcional) → 201 com o banco. Sem logo → `default.jpg`.
- `PUT /api/admin/banks/:id` (multipart: `name`, `logo` opcional) → 200; sem `logo`, o logo atual fica.
- `name` obrigatório, até 255 → 422 no formato do Laravel. Banco inexistente → 404.

Aceite: integração (criar com e sem logo; editar nome e logo; 422; 404).

### REQ-ADB-04 — Upload seguro do logo
Origem: RN-ADB-003 · Decisão: **corrigir** (o legado não validava e sobrescreveria o logo padrão) — ADR-010 (DUV-ADB-003)

- O logo DEVE ser PNG, JPEG ou WebP **pelo conteúdo** (assinatura), até 1 MB. Senão → 422
  `{"logo":["The logo must be a PNG, JPEG or WebP image up to 1 MB."]}`, e nada é gravado.
- O arquivo DEVE ser salvo com nome aleatório e a extensão do tipo **detectado** (não a enviada).
- O sistema NUNCA DEVE sobrescrever o `default.jpg` nem o arquivo de outro banco. Ao trocar o logo, o arquivo antigo
  (se não for o padrão) DEVE ser removido depois que a troca for gravada.
- Se a gravação no banco falhar, o arquivo novo NÃO DEVE ficar no volume.

Aceite: integração (arquivo `.png` que é texto → 422; 1 MB + 1 → 422; troca de logo apaga o antigo; banco com
`default.jpg` editado não altera o padrão; falha no banco não deixa arquivo órfão).

### REQ-ADB-05 — Excluir banco
Origem: RN-ADB-004 · Decisão: **manter** a exclusão; **corrigir** o 500 — ADR-010 (DUV-ADB-004)

- `DELETE /api/admin/banks/:id` → 204 e remove o arquivo do logo (se não for o padrão), quando nenhuma conta bancária
  usa o banco.
- Em uso → 422 `{"message":"Bank has bank accounts."}`, e nada é apagado.

Aceite: integração (sem uso → 204 e arquivo removido; em uso → 422, banco e arquivo intactos).

### REQ-ADB-06 — Logos servidos e migrados
Origem: RN-ADB-007 · Decisão: **nova implementação** — ADR-010 (DUV-ADB-002)

- O nginx da `:8083` DEVE servir `/storage/banks/imagens/<arquivo>` do volume de arquivos. Arquivo ausente → imagem
  padrão.
- `ASSETS_URL` DEVE apontar para a `:8083`: os logos que a API devolve abrem na mesma origem das telas.
- `tools/migrar-logos.mjs` DEVE copiar para o volume os arquivos de logo referenciados na tabela `banks` e relatar os
  ausentes.

Aceite: `curl` (logo enviado → 200 com o tipo certo; ausente → imagem padrão); espelho sem diferença; teste da
ferramenta (copia os existentes, relata os ausentes).

### REQ-ADB-07 — Telas de admin no `web/`; recuperação de senha não migrada
Origem: RN-ADB-002, RN-ADB-006 · Decisão: **nova implementação**; recuperação **não migrada** — ADR-010 (DUV-ADB-006)

- `/admin/banks` (lista com logo, paginação, excluir), `/admin/banks/novo` e `/admin/banks/:id` (formulário com logo).
  Admin vê o link em "Minha conta"; os outros usuários recebem a mensagem de acesso negado.
- Não há tela de recuperação de senha. `/admin/password/*` → "não encontrada".

Aceite: E2E (admin cria com logo, vê o logo na lista, edita, exclui; banco em uso mostra a mensagem; cliente comum não
acessa).
