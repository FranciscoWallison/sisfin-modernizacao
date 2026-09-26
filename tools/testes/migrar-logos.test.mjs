// A04 — tools/migrar-logos.mjs: `node --test tools/testes/migrar-logos.test.mjs`
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { destinoLocal, migrarLogos } from '../migrar-logos.mjs';

const raiz = mkdtempSync(join(tmpdir(), 'teste-logos-'));
const origem = join(raiz, 'origem');
const destino = join(raiz, 'destino');
after(() => rmSync(raiz, { recursive: true, force: true }));

// Assinaturas reais (a ferramenta confere o conteúdo, como a API)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex');
const LOGOS = ['a.png', 'b.jpeg', 'ausente.png', '../segredo', 'a.png'];

test('copia os existentes, relata os ausentes e recusa nome que sairia do diretório', () => {
  rmSync(raiz, { recursive: true, force: true });
  mkdirSync(origem, { recursive: true });
  writeFileSync(join(origem, 'a.png'), PNG);
  writeFileSync(join(origem, 'b.jpeg'), JPEG);
  writeFileSync(join(raiz, 'segredo'), 'NÃO COPIAR');

  const r = migrarLogos(LOGOS, origem, destinoLocal(destino));
  assert.deepEqual(r, { copiados: ['a.png', 'b.jpeg'], jaPresentes: [], ausentes: ['ausente.png'], recusados: ['../segredo'] });
  assert.deepEqual(readdirSync(destino).sort(), ['a.png', 'b.jpeg']);
  assert.deepEqual(readFileSync(join(destino, 'a.png')), PNG);
});

test('idempotente: segunda execução não copia nada e NUNCA sobrescreve o que já está no destino', () => {
  writeFileSync(join(destino, 'b.jpeg'), 'JÁ ESTAVA'); // ex.: a API já gravou um arquivo com esse nome
  const r = migrarLogos(LOGOS, origem, destinoLocal(destino));
  assert.deepEqual(r.copiados, []);
  assert.deepEqual(r.jaPresentes, ['a.png', 'b.jpeg']);
  assert.equal(readFileSync(join(destino, 'b.jpeg'), 'utf8'), 'JÁ ESTAVA');
});

// Revisão de segurança A06 (S2): o volume só pode receber PNG/JPEG/WebP de verdade — o nginx serve na origem do app
test('S2: recusa extensão fora de png/jpg/jpeg/webp e conteúdo que não é imagem, mesmo com nome de imagem', () => {
  writeFileSync(join(origem, 'evil.html'), PNG); // conteúdo de imagem, extensão perigosa
  writeFileSync(join(origem, 'x.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  writeFileSync(join(origem, 'falso.png'), '<!doctype html><script>alert(1)</script>');
  const r = migrarLogos(['evil.html', 'x.svg', 'falso.png'], origem, destinoLocal(destino));
  assert.deepEqual(r.recusados, ['evil.html', 'x.svg', 'falso.png']);
  assert.deepEqual(r.copiados, []);
  assert.deepEqual(readdirSync(destino).sort(), ['a.png', 'b.jpeg']);
});

test('S2: recusa link simbólico (copiaria o arquivo para onde ele aponta)', (t) => {
  writeFileSync(join(raiz, 'fora.png'), PNG);
  try {
    symlinkSync(join(raiz, 'fora.png'), join(origem, 'link.png'));
  } catch (e) {
    return t.skip(`sem permissão para criar link simbólico aqui (${e.code})`);
  }
  const r = migrarLogos(['link.png'], origem, destinoLocal(destino));
  assert.deepEqual(r.recusados, ['link.png']);
  assert.deepEqual(r.copiados, []);
});
