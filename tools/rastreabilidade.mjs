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

// Regras do legado (ignora as marcadas como obsoletas). Regras com "**Paridade:** n/a — … (Txx)" não são
// observáveis por HTTP e precisam dizer qual task as cobre.
const semParidadeHttp = new Map(); // RN → justificativa
const regras = walk(join(SPECS, 'legado', 'modulos'))
  .filter((p) => p.endsWith('regras.md'))
  .flatMap((p) =>
    read(p)
      .split(/^### /m)
      .slice(1)
      .flatMap((bloco) => {
        const m = bloco.match(/^(~~)?(RN-[A-Z]+-\d+)/);
        if (!m || m[1]) return [];
        const na = bloco.match(/\*\*Paridade:\*\*\s*n\/a\b(.*)/);
        if (na) semParidadeHttp.set(m[2], na[1]);
        return [m[2]];
      }),
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
    Paridade: rnComParidade.has(rn) ? '✅' : semParidadeHttp.has(rn) ? 'n/a' : '—',
  };
});
console.table(linhas);

const orfaos = {
  'RN sem requisito': regras.filter((rn) => !rnComReq.has(rn)),
  'RN sem caso de paridade': regras.filter((rn) => !rnComParidade.has(rn) && !semParidadeHttp.has(rn)),
  'RN com paridade n/a sem task que a cubra (Txx, Fxx…)': [...semParidadeHttp]
    .filter(([, justificativa]) => !/\b[A-Z]\d{2}\b/.test(justificativa)) // T01, F02… (id da task no plano do módulo)
    .map(([rn]) => rn),
  'REQ sem task': [...requisitos.keys()].filter((r) => !reqComTask.has(r)),
};
let total = 0;
for (const [titulo, lista] of Object.entries(orfaos)) {
  total += lista.length;
  console.log(`${lista.length ? '⚠️' : '✅'} ${titulo}: ${lista.length ? lista.join(', ') : 'nenhum'}`);
}
if (process.argv.includes('--strict') && total > 0) process.exit(1);
