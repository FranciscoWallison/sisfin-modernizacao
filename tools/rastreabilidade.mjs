#!/usr/bin/env node
// Matriz RN → REQ → Task / Paridade a partir de .specs/.
// Uso: node tools/rastreabilidade.mjs [--strict]   (--strict: exit 1 se houver órfãos)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SPECS = join(ROOT, '.specs');

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      })
    : [];

const read = (p) => readFileSync(p, 'utf8');
const ids = (text, re) => [...new Set(text.match(re) ?? [])];

// Regras do legado (ignora as marcadas como obsoletas)
const regras = walk(join(SPECS, 'legado', 'modulos'))
  .filter((p) => p.endsWith('regras.md'))
  .flatMap((p) =>
    [...read(p).matchAll(/^### (~~)?(RN-[A-Z]+-\d+)/gm)].filter((m) => !m[1]).map((m) => m[2]),
  );

// Requisitos do TO-BE e suas origens
const requisitos = new Map(); // REQ → [RN]
for (const p of walk(join(SPECS, 'novo')).filter((p) => p.endsWith('requirements.md'))) {
  for (const bloco of read(p).split(/^### /m).slice(1)) {
    const req = bloco.match(/^(REQ-[A-Z]+-\d+)/)?.[1];
    if (req) requisitos.set(req, ids(bloco.match(/Origem:.*$/m)?.[0] ?? '', /RN-[A-Z]+-\d+/g));
  }
}

const tasksText = walk(join(SPECS, 'novo')).filter((p) => p.endsWith('tasks.md')).map(read).join('\n');
const paridadeText = walk(join(SPECS, 'paridade')).filter((p) => p.endsWith('.json')).map(read).join('\n');

const rnComReq = new Set([...requisitos.values()].flat());
const rnComParidade = new Set(ids(paridadeText, /RN-[A-Z]+-\d+/g));
const reqComTask = new Set(ids(tasksText, /REQ-[A-Z]+-\d+/g));

const linhas = regras.map((rn) => {
  const reqs = [...requisitos].filter(([, rns]) => rns.includes(rn)).map(([r]) => r);
  return {
    RN: rn,
    REQ: reqs.join(', ') || '—',
    Task: reqs.some((r) => reqComTask.has(r)) ? '✅' : '—',
    Paridade: rnComParidade.has(rn) ? '✅' : '—',
  };
});
console.table(linhas);

const orfaos = {
  'RN sem requisito': regras.filter((rn) => !rnComReq.has(rn)),
  'RN sem caso de paridade': regras.filter((rn) => !rnComParidade.has(rn)),
  'REQ sem task': [...requisitos.keys()].filter((r) => !reqComTask.has(r)),
};
let total = 0;
for (const [titulo, lista] of Object.entries(orfaos)) {
  total += lista.length;
  console.log(`${lista.length ? '⚠️' : '✅'} ${titulo}: ${lista.length ? lista.join(', ') : 'nenhum'}`);
}
if (process.argv.includes('--strict') && total > 0) process.exit(1);
