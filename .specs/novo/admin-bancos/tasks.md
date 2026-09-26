Status: aprovado · Aprovado por: Francisco · Em: 2026-09-26 · Hash: bb0f9a303b2e

# Tasks — módulo `admin-bancos`

> Plano de `design.md`. Aprovação: `node tools/aprovar-tasks.mjs admin-bancos "<nome>"` (ato humano). Andamento em
> `progresso.md` (este arquivo fica imutável depois de aprovado). Cada task ganha entrada em `docs/diario-de-bordo.md`.

- [ ] **A01. Listagem e autorização** — `SomenteAdminGuard`; `GET /api/admin/banks` paginado em 5. Aceite: integração (401 sem token; 403 para cliente comum; 5 por página; logo absoluto). **REQ-ADB-01, REQ-ADB-02**.
- [ ] **A02. Upload seguro** — `domain/imagem.ts` (assinatura PNG/JPEG/WebP, 1 MB) + `infra/arquivos.ts` (nome aleatório, `wx`, remoção); `ARQUIVOS_DIR` na config. Aceite: unitários + integração (texto com extensão `.png` → 422; 1 MB + 1 → 422; nunca sobrescreve). **REQ-ADB-04**.
- [ ] **A03. Criar, editar e excluir** — serviço com a ordem arquivo → banco → antigo; em uso → 422. Aceite: integração (criar com e sem logo; editar troca e apaga o antigo; `default.jpg` intocado; falha no banco não deixa arquivo; excluir sem uso → 204 e arquivo removido; em uso → 422 e nada muda; 403 sem gravar). **REQ-ADB-03, REQ-ADB-04, REQ-ADB-05**.
- [ ] **A04. Servir e migrar logos** — volume `arquivos` (api rw, spa-novo ro); nginx `/storage/` com imagem padrão; `ASSETS_URL` na `:8083`; espelho normaliza a origem; `tools/migrar-logos.mjs`. Aceite: `curl` (logo enviado 200 com o tipo certo; ausente → padrão); espelho 20/20; teste da ferramenta. **REQ-ADB-06**.
- [ ] **A05. Telas no `web/`** — lista, novo, editar e excluir; link em "Minha conta" para admin. Aceite: E2E (fluxo completo do admin com PNG e logo visível; banco em uso mostra a mensagem; cliente comum sem acesso; `/admin/register` e `/admin/password/reset` → não encontrada). **REQ-ADB-02, REQ-ADB-07**.
- [ ] **A06. Segurança e documentação** — `security-reviewer` (upload, autorização, arquivos servidos); achados viram testes que falham antes da correção; progresso, diário, README, inventário; CI. **REQ-ADB-04**.
