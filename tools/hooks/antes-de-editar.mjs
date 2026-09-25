#!/usr/bin/env node
// Hook PreToolUse (Edit|Write|MultiEdit) do Claude Code — guia computacional.
// 1. Bloqueia edição em legacy/ (reforça o deny do settings.json, com mensagem explicativa).
// 2. Bloqueia código do módulo api/src/modules/<mod>/ (ou web/src/modules/<mod>/) sem tasks.md aprovado com hash válido.
// Exit 2 = bloqueia; o stderr volta para o agente como explicação.
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { verificarAprovacao } from '../lib/tasks.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let entrada = '';
for await (const pedaco of process.stdin) entrada += pedaco;

const toolInput = JSON.parse(entrada || '{}').tool_input ?? {};
const arquivo = toolInput.file_path;
if (!arquivo) process.exit(0);
const rel = relative(raiz, arquivo).replaceAll('\\', '/');

// Aprovar o plano é ato humano (node tools/aprovar-tasks.mjs), nunca uma edição do agente
if (/^\.specs\/novo\/[^/]+\/tasks\.md$/.test(rel)) {
  const novoTexto = [toolInput.new_string, toolInput.content, ...(toolInput.edits ?? []).map((e) => e.new_string)].join('\n');
  if (/Status:\s*aprovado/i.test(novoTexto)) {
    console.error('Bloqueado: só o humano aprova um tasks.md (node tools/aprovar-tasks.mjs <modulo> "<nome>"). Deixe "Status: rascunho" e peça aprovação.');
    process.exit(2);
  }
}

if (rel.startsWith('legacy/')) {
  console.error(
    `Bloqueado: ${rel} é o ORÁCULO e é somente leitura. Para investigar, leia o código ou use ` +
      `"node tools/oraculo-sql.mjs MÉTODO /rota" e registre o achado em .specs/legado/.`,
  );
  process.exit(2);
}

const m = rel.match(/^(?:api|web)\/src\/modules\/([^/]+)\//);
if (m) {
  const { ok, motivo } = verificarAprovacao(raiz, m[1]);
  if (!ok) {
    console.error(`Bloqueado: implementação do módulo "${m[1]}" exige plano aprovado — ${motivo}`);
    process.exit(2);
  }
}
process.exit(0);
