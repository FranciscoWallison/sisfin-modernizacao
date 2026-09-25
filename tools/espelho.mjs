#!/usr/bin/env node
// Espelho de leitura: logo após o ETL os dois bancos têm os MESMOS dados, então cada GET precisa responder
// IGUAL no legado e no sistema novo (valores, não só formato). Complementa a paridade (que mede efeitos por delta).
//
//   node tools/migrar-dados.mjs && node tools/espelho.mjs
//   node tools/espelho.mjs --novo http://localhost:3300 --legado http://localhost:8081
import { isDeepStrictEqual } from 'node:util';
import { criarCliente } from './lib/api.mjs';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : padrao);
const LEGADO = opcao('--legado', 'http://localhost:8081');
const NOVO = opcao('--novo', 'http://localhost:3300');

const legado = criarCliente(LEGADO);
const novo = criarCliente(NOVO);

// Links de paginação trazem o host de cada sistema
const normalizar = (valor) => JSON.parse(JSON.stringify(valor).replaceAll(LEGADO, '<base>').replaceAll(NOVO, '<base>'));

function diferencas(a, b, caminho = '$', saida = []) {
  if (isDeepStrictEqual(a, b)) return saida;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diferencas(a[k], b[k], `${caminho}.${k}`, saida);
  } else {
    saida.push(`${caminho}: legado=${JSON.stringify(a)} novo=${JSON.stringify(b)}`);
  }
  return saida;
}

const USUARIOS = {
  c1: { email: 'cliente1@user.com', password: 'secret' },
  c3: { email: 'cliente3@user.com', password: 'secret' },
};

// Id de uma conta bancária do cliente 1 (para o teste entre clientes)
const contaDoC1 = (await legado.requisitar(USUARIOS.c1, 'GET', '/api/bank_accounts')).corpo.data[0].id;

const ROTAS = [
  ['c1', '/api/user'],
  ['c1', '/api/bank_accounts'],
  ['c1', '/api/bank_accounts/lists'],
  ['c1', `/api/bank_accounts/${contaDoC1}`],
  ['c1', '/api/category_expenses'],
  ['c1', '/api/category_revenues'],
  ['c1', '/api/statements'],
  ['c1', '/api/statements?orderBy=id&sortedBy=desc'],
  ['c1', '/api/statements?page=2'],
  ['c3', '/api/bank_accounts'],
  ['c3', '/api/statements'],
  ['c3', `/api/bank_accounts/${contaDoC1}`], // conta de OUTRO cliente → 404 nos dois
];

let falhas = 0;
for (const [quem, rota] of ROTAS) {
  const [a, b] = await Promise.all([
    legado.requisitar(USUARIOS[quem], 'GET', rota),
    novo.requisitar(USUARIOS[quem], 'GET', rota),
  ]);
  const difs = a.status !== b.status ? [`status: legado=${a.status} novo=${b.status}`] : a.status === 200 ? diferencas(normalizar(a.corpo), normalizar(b.corpo)) : [];
  if (difs.length) {
    falhas++;
    console.log(`❌ ${quem} GET ${rota}`);
    difs.slice(0, 12).forEach((d) => console.log(`   ${d}`));
    if (difs.length > 12) console.log(`   … +${difs.length - 12} diferença(s)`);
  } else console.log(`✅ ${quem} GET ${rota} (${a.status})`);
}
console.log(`\n${ROTAS.length} rota(s), ${falhas} com diferença — ${LEGADO} × ${NOVO}`);
process.exitCode = falhas ? 1 : 0;
