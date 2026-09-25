#!/usr/bin/env node
// Uso HUMANO: aprova o tasks.md de um módulo gravando o hash do plano na 1ª linha.
//   node tools/aprovar-tasks.mjs contas "Francisco"
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { caminhoTasks, hashDoPlano } from './lib/tasks.mjs';

const [modulo, quem = 'humano'] = process.argv.slice(2);
if (!modulo) {
  console.error('uso: node tools/aprovar-tasks.mjs <modulo> [quem-aprova]');
  process.exit(1);
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arq = caminhoTasks(raiz, modulo);
const linhas = readFileSync(arq, 'utf8').replace(/\r\n/g, '\n').split('\n');
const hash = hashDoPlano(linhas.join('\n'));
const data = new Date().toISOString().slice(0, 10);
linhas[0] = `Status: aprovado · Aprovado por: ${quem} · Em: ${data} · Hash: ${hash}`;
writeFileSync(arq, linhas.join('\n'));
console.log(`✅ ${modulo}: tasks.md aprovado (hash ${hash})`);
