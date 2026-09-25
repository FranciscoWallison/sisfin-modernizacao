#!/usr/bin/env node
// Hook PostToolUse (Edit|Write|MultiEdit) do Claude Code — sensores computacionais rápidos.
// Exit 2 = o stderr volta para o agente corrigir na hora.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let entrada = '';
for await (const pedaco of process.stdin) entrada += pedaco;
const arquivo = JSON.parse(entrada || '{}').tool_input?.file_path;
if (!arquivo) process.exit(0);
const rel = relative(raiz, arquivo).replaceAll('\\', '/');
const problemas = [];

// Caso de paridade: estrutura mínima
if (/^\.specs\/paridade\/.+\.json$/.test(rel)) {
  try {
    const c = JSON.parse(readFileSync(arquivo, 'utf8'));
    if (!Array.isArray(c.rn) || !c.rn.length) problemas.push('"rn" deve listar as regras cobertas (ex.: ["RN-CON-003"]).');
    if (!c.usuarios?.padrao) problemas.push('"usuarios.padrao" é obrigatório.');
    if (!Array.isArray(c.passos) || !c.passos.length) problemas.push('"passos" não pode ser vazio.');
    for (const p of c.passos ?? []) if (!p.nome || !p.rota) problemas.push(`passo sem "nome"/"rota": ${JSON.stringify(p).slice(0, 80)}`);
    if (/\bsql\b/i.test(JSON.stringify(c.passos ?? []))) problemas.push('casos de paridade só usam HTTP — SQL amarra o caso ao schema do legado.');
  } catch (e) {
    problemas.push(`JSON inválido: ${e.message}`);
  }
}

// Regras: IDs estáveis e sem duplicata
if (/^\.specs\/legado\/modulos\/[^/]+\/regras\.md$/.test(rel)) {
  const ids = [...readFileSync(arquivo, 'utf8').matchAll(/^### (?:~~)?(RN-[A-Z]+-\d{3})/gm)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problemas.push(`IDs de regra duplicados: ${[...new Set(dup)].join(', ')}. IDs são imutáveis — use o próximo número livre.`);
}

// TypeScript do sistema novo: typecheck do projeto (quando existir)
const projeto = rel.match(/^(api|web)\/.+\.(ts|vue)$/)?.[1];
if (projeto && existsSync(join(raiz, projeto, 'tsconfig.json'))) {
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', join(raiz, projeto)], { stdio: 'pipe', shell: true, timeout: 90_000 });
  } catch (e) {
    problemas.push(`typecheck de ${projeto}/ falhou:\n${String(e.stdout).slice(0, 2000)}`);
  }
}

if (problemas.length) {
  console.error(`Sensor pós-edição (${rel}):\n- ${problemas.join('\n- ')}`);
  process.exit(2);
}
process.exit(0);
