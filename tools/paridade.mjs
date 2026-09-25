#!/usr/bin/env node
// Executor de paridade (golden master) — roda os casos de .specs/paridade/ contra uma API.
//
//   node tools/paridade.mjs                       # compara com "esperado" (legado em :8081)
//   node tools/paridade.mjs --capturar            # grava o resultado atual em "esperado"
//   node tools/paridade.mjs --base http://localhost:3000 --alvo novo contas/RN-CON-003
//
// --alvo novo aplica sobre o "esperado" as divergências aprovadas em "divergencias" (cada uma cita um ADR):
//   "divergencias": { "adr": "ADR-003", "esperado": { "delta_excluir": 10 } }
//
// Só usa HTTP: o mesmo caso roda contra o legado e contra o sistema novo.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BASE_PADRAO, criarCliente } from './lib/api.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = join(ROOT, '.specs', 'paridade');

const args = process.argv.slice(2);
const capturar = args.includes('--capturar');
const baseIdx = args.indexOf('--base');
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : BASE_PADRAO;
const alvoIdx = args.indexOf('--alvo');
const ALVO = alvoIdx >= 0 ? args[alvoIdx + 1] : 'legado';
if (!['legado', 'novo'].includes(ALVO)) throw new Error(`--alvo deve ser "legado" ou "novo" (recebi ${ALVO})`);
const valoresDeOpcao = new Set([baseIdx, alvoIdx].filter((i) => i >= 0).map((i) => i + 1));
const filtros = args.filter((a, i) => !a.startsWith('--') && !valoresDeOpcao.has(i));

const walk = (d) =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

// "data.0.id" → valor
const pegar = (obj, caminho) =>
  caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// "{{x}}" sozinho mantém o tipo; embutido em texto vira string
const substituir = (v, vars) => {
  if (typeof v === 'string') {
    const unico = v.match(/^\{\{(\w+)\}\}$/);
    if (unico) return vars[unico[1]];
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k]));
  }
  if (Array.isArray(v)) return v.map((x) => substituir(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, substituir(x, vars)]));
  return v;
};

// Mantém só os campos pedidos (em objeto ou em cada item de lista)
const projetar = (valor, campos) => {
  if (!campos) return valor;
  const um = (o) => Object.fromEntries(campos.map((c) => [c, o?.[c]]));
  return Array.isArray(valor) ? valor.map(um) : um(valor);
};

const api = criarCliente(BASE);

async function executar(caso) {
  const vars = { execucao: Date.now().toString(36) };
  const resultado = {};
  for (const passo of caso.passos) {
    const usuario = caso.usuarios[passo.usuario ?? 'padrao'];
    const r = await api.requisitar(
      usuario,
      passo.metodo ?? 'GET',
      substituir(passo.rota, vars),
      passo.corpo ? substituir(passo.corpo, vars) : undefined,
    );
    const corpo = r.corpo;
    for (const [nome, caminho] of Object.entries(passo.salvar ?? {})) vars[nome] = pegar(corpo, caminho);
    if (passo.registrar !== false) {
      resultado[passo.nome] = { status: r.status };
      if (passo.caminho) resultado[passo.nome].corpo = projetar(pegar(corpo, passo.caminho), passo.campos);
    }
  }
  // Afirmações derivadas: expressões JS sobre as variáveis salvas (ex.: deltas de saldo)
  for (const [nome, expr] of Object.entries(caso.derivar ?? {})) {
    resultado[nome] = Function(...Object.keys(vars), `return (${expr});`)(...Object.values(vars));
  }
  return resultado;
}

const casos = walk(DIR)
  .filter((p) => p.endsWith('.json'))
  .filter((p) => !filtros.length || filtros.some((f) => relative(DIR, p).replaceAll('\\', '/').includes(f)));

let falhas = 0;
for (const arquivo of casos) {
  const nome = relative(DIR, arquivo).replaceAll('\\', '/');
  const caso = JSON.parse(readFileSync(arquivo, 'utf8'));
  let atual;
  try {
    atual = await executar(caso);
  } catch (e) {
    falhas++;
    console.log(`💥 ${nome}: ${e.message}`);
    continue;
  }
  const esperado = ALVO === 'novo' ? { ...caso.esperado, ...(caso.divergencias?.esperado ?? {}) } : caso.esperado;
  if (capturar && ALVO === 'novo') {
    console.log(`⛔ ${nome}: --capturar só grava a partir do legado (o oráculo)`);
    falhas++;
  } else if (capturar) {
    caso.esperado = atual;
    caso.capturado = { em: new Date().toISOString().slice(0, 10), de: BASE };
    writeFileSync(arquivo, JSON.stringify(caso, null, 2) + '\n');
    console.log(`📸 ${nome}: capturado`);
  } else if (isDeepStrictEqual(atual, esperado)) {
    console.log(`✅ ${nome}`);
  } else {
    falhas++;
    const modulo = nome.split('/')[0];
    console.log(`❌ ${nome}`);
    // Mensagem pensada para o agente: onde está a regra e o que fazer com a divergência
    console.log(
      `   Regra(s) ${caso.rn.join(', ')} em .specs/legado/modulos/${modulo}/regras.md. ` +
        `Se a divergência for intencional, registre-a num ADR em .specs/decisoes/ e no bloco "divergencias" do caso; ` +
        `senão, corrija a implementação. Nunca edite o "esperado" à mão: ele é capturado do legado.`,
    );
    for (const k of new Set([...Object.keys(esperado ?? {}), ...Object.keys(atual)])) {
      if (!isDeepStrictEqual(atual[k], esperado?.[k]))
        console.log(`   ${k}\n     esperado: ${JSON.stringify(esperado?.[k])}\n     atual:    ${JSON.stringify(atual[k])}`);
    }
  }
}
console.log(`\n${casos.length} caso(s), ${falhas} falha(s) — ${BASE} (alvo: ${ALVO})`);
// exitCode em vez de process.exit(): no Windows, sair com sockets do fetch abertos derruba o Node
// (assert em src\win\async.c) e devolve código 127 em vez de 0/1.
process.exitCode = falhas ? 1 : 0;
