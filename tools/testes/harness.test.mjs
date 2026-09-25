// Testes do próprio harness: `node --test tools/testes/harness.test.mjs`
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOD = 'zz-teste-harness';
const dirMod = join(raiz, '.specs', 'novo', MOD);
const tasks = join(dirMod, 'tasks.md');
const codigo = join(raiz, 'api', 'src', 'modules', MOD, 'x.service.ts');

const hook = (nome, tool_input) =>
  spawnSync('node', [join(raiz, 'tools', 'hooks', nome)], { input: JSON.stringify({ tool_input }), encoding: 'utf8' });

after(() => rmSync(dirMod, { recursive: true, force: true }));

test('bloqueia edição do oráculo', () => {
  const r = hook('antes-de-editar.mjs', { file_path: join(raiz, 'legacy', 'app', 'Models', 'BillPay.php') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ORÁCULO/);
});

test('código de módulo exige tasks.md aprovado, e a aprovação cai se o plano mudar', () => {
  rmSync(dirMod, { recursive: true, force: true });
  assert.equal(hook('antes-de-editar.mjs', { file_path: codigo }).status, 2, 'sem tasks.md');

  mkdirSync(dirMod, { recursive: true });
  writeFileSync(tasks, 'Status: rascunho\n\n- [ ] T1. algo\n');
  assert.equal(hook('antes-de-editar.mjs', { file_path: codigo }).status, 2, 'rascunho');

  assert.equal(spawnSync('node', [join(raiz, 'tools', 'aprovar-tasks.mjs'), MOD, 'teste']).status, 0);
  assert.equal(hook('antes-de-editar.mjs', { file_path: codigo }).status, 0, 'aprovado');

  appendFileSync(tasks, '- [ ] T2. escopo novo\n');
  const r = hook('antes-de-editar.mjs', { file_path: codigo });
  assert.equal(r.status, 2, 'alterado após aprovação');
  assert.match(r.stderr, /aprovação caiu/);
});

test('agente não pode se autoaprovar editando tasks.md', () => {
  const r = hook('antes-de-editar.mjs', { file_path: tasks, old_string: 'Status: rascunho', new_string: 'Status: aprovado · Hash: 000000000000' });
  assert.equal(r.status, 2);
});

test('sensor pós-edição rejeita caso de paridade malformado ou com SQL', () => {
  const arq = join(dirMod, 'caso.json'); // fora de .specs/paridade → ignorado
  mkdirSync(dirMod, { recursive: true });
  writeFileSync(arq, '{}');
  assert.equal(hook('depois-de-editar.mjs', { file_path: arq }).status, 0);

  const ruim = join(raiz, '.specs', 'paridade', `${MOD}.json`);
  writeFileSync(ruim, JSON.stringify({ rn: [], passos: [{ nome: 'x', rota: '/api', sql: 'select 1' }] }));
  try {
    const r = hook('depois-de-editar.mjs', { file_path: ruim });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /só usam HTTP/);
  } finally {
    rmSync(ruim, { force: true });
  }
});

test('regras.md atual tem IDs únicos', () => {
  const r = hook('depois-de-editar.mjs', { file_path: join(raiz, '.specs', 'legado', 'modulos', 'contas', 'regras.md') });
  assert.equal(r.status, 0, r.stderr);
});
