#!/usr/bin/env node
// A04 (admin-bancos, ADR-010) — copia os logos dos bancos do storage do legado para o volume de arquivos do novo.
//
//   node tools/migrar-logos.mjs --origem <dir>                    # para o volume da API (docker compose cp)
//   node tools/migrar-logos.mjs --origem <dir> --destino <dir>    # para um diretório local
//
// <dir> de origem = storage/app/public/banks/imagens do legado. Os nomes vêm de `banks.logo` no MySQL do legado.
// - Idempotente: arquivo que já está no destino NÃO é copiado de novo nem sobrescrito (a API também nunca sobrescreve).
// - Relata os ausentes na origem (no seed, os 3: RN-ADB-007) — a tela mostra a imagem padrão para eles.
// - Recusa nome que sairia do diretório (dado do banco não é confiável): mesma regra de logoRemovivel() da API.
// - Revisão de segurança A06 (S2): o volume é servido na origem do app, então só entra imagem DE VERDADE — extensão
//   png/jpg/jpeg/webp E conteúdo com a assinatura (mesma regra de detectarImagem() da API). Link simbólico é recusado
//   (copiaria o arquivo para onde ele aponta); o que se copia é o conteúdo lido e conferido, não o caminho.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR_NO_CONTAINER = '/data/arquivos/banks/imagens';
export const nomeSeguro = (nome) => typeof nome === 'string' && nome.length <= 255 && /^[A-Za-z0-9][A-Za-z0-9_-]*\.(png|jpe?g|webp)$/i.test(nome);

const comeca = (b, assinatura, desde = 0) => b.length >= desde + assinatura.length && assinatura.every((x, i) => b[desde + i] === x);
/** PNG, JPEG ou WebP pela assinatura — espelho de api/src/modules/admin-bancos/domain/imagem.ts. */
export const ehImagem = (b) =>
  comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
  comeca(b, [0xff, 0xd8, 0xff]) ||
  (comeca(b, [0x52, 0x49, 0x46, 0x46]) && comeca(b, [0x57, 0x45, 0x42, 0x50], 8));

/** Arquivo regular (não link, não diretório) → conteúdo; ausente → null; qualquer outra coisa → 'recusado'. */
function lerArquivo(caminho) {
  let info;
  try {
    info = lstatSync(caminho);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  return info.isFile() ? readFileSync(caminho) : 'recusado';
}

/**
 * Decide e executa a cópia. `destino` = { presentes: Set<string>, copiar(conteudo, nome) }.
 * Devolve { copiados, jaPresentes, ausentes, recusados } (listas de nomes, sem repetição).
 */
export function migrarLogos(logos, origem, destino) {
  const r = { copiados: [], jaPresentes: [], ausentes: [], recusados: [] };
  for (const nome of [...new Set(logos)]) {
    if (!nomeSeguro(nome)) r.recusados.push(nome);
    else if (destino.presentes.has(nome)) r.jaPresentes.push(nome);
    else {
      const conteudo = lerArquivo(join(origem, nome));
      if (conteudo === null) r.ausentes.push(nome);
      else if (conteudo === 'recusado' || !ehImagem(conteudo)) r.recusados.push(nome);
      else {
        destino.copiar(conteudo, nome);
        r.copiados.push(nome);
      }
    }
  }
  return r;
}

/** Destino num diretório local (testes; ou um volume montado no host). */
export function destinoLocal(dir) {
  mkdirSync(dir, { recursive: true });
  return { presentes: new Set(readdirSync(dir)), copiar: (conteudo, nome) => writeFileSync(join(dir, nome), conteudo, { flag: 'wx', mode: 0o644 }) };
}

function docker(args, opcoes = {}) {
  const r = spawnSync('docker', ['compose', ...args], { encoding: 'utf8', ...opcoes });
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} falhou: ${r.stderr || r.error}`);
  return r.stdout;
}

/** Destino no volume da API: copia só os novos, de uma vez, por um diretório de preparo. */
function destinoNoConteiner() {
  docker(['exec', '-T', 'api', 'mkdir', '-p', DIR_NO_CONTAINER]);
  const presentes = new Set(docker(['exec', '-T', 'api', 'ls', '-1', DIR_NO_CONTAINER]).split('\n').filter(Boolean));
  const preparo = mkdtempSync(join(tmpdir(), 'sisfin-logos-'));
  return {
    presentes,
    copiar: (conteudo, nome) => writeFileSync(join(preparo, nome), conteudo, { flag: 'wx', mode: 0o644 }),
    concluir() {
      const novos = readdirSync(preparo);
      if (novos.length) {
        docker(['cp', `${preparo}/.`, `api:${DIR_NO_CONTAINER}/`]);
        // o docker cp grava como root e 0755 (A06, S5): mesmo dono e modo dos arquivos que a API grava
        const caminhos = novos.map((n) => `${DIR_NO_CONTAINER}/${n}`);
        docker(['exec', '-T', '-u', 'root', 'api', 'chown', 'node:node', ...caminhos]);
        docker(['exec', '-T', '-u', 'root', 'api', 'chmod', '644', ...caminhos]);
      }
      rmSync(preparo, { recursive: true, force: true });
    },
  };
}

async function logosDoLegado() {
  const { default: mysql } = await import('mysql2/promise');
  const conexao = await mysql.createConnection(process.env.LEGACY_DATABASE_URL ?? 'mysql://root:root@localhost:33061/sisfin');
  try {
    const [linhas] = await conexao.query('SELECT logo FROM banks ORDER BY id');
    return linhas.map((l) => l.logo);
  } finally {
    await conexao.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opcao = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined);
  const origem = opcao('--origem');
  if (!origem || !existsSync(origem)) {
    console.error('Uso: node tools/migrar-logos.mjs --origem <dir com os logos do legado> [--destino <dir>]');
    process.exit(1);
  }
  const destino = opcao('--destino') ? destinoLocal(opcao('--destino')) : destinoNoConteiner();
  const r = migrarLogos(await logosDoLegado(), origem, destino);
  destino.concluir?.();
  console.log(`copiados: ${r.copiados.length} · já no destino: ${r.jaPresentes.length} · ausentes na origem: ${r.ausentes.length} · recusados: ${r.recusados.length}`);
  for (const n of r.ausentes) console.log(`  ausente: ${n} (a tela mostra a imagem padrão)`);
  for (const n of r.recusados) console.log(`  recusado (nome inseguro): ${JSON.stringify(n)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
