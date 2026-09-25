#!/usr/bin/env node
// Sensor de observabilidade do oráculo: executa UMA requisição no legado e mostra
// todo o SQL que ela disparou (via general_log do MySQL). É o "Tardis" deste projeto:
// responde "o que este endpoint realmente faz no banco?" sem ler o PHP.
//
//   node tools/oraculo-sql.mjs GET /api/bank_accounts
//   node tools/oraculo-sql.mjs PUT /api/bill_pays/12 '{"name":"x","date_due":"2027-01-01","value":10,"done":true,"category_id":7,"bank_account_id":4}'
//   node tools/oraculo-sql.mjs --usuario cliente3@user.com GET /api/bill_pays
//
// No Git Bash, prefixe com MSYS_NO_PATHCONV=1 (senão "/api/..." vira um caminho do Windows).
import { execFileSync } from 'node:child_process';
import { criarCliente } from './lib/api.mjs';

const args = process.argv.slice(2);
let email = 'cliente1@user.com';
const iu = args.indexOf('--usuario');
if (iu >= 0) email = args.splice(iu, 2)[1];
const [metodo, rota, corpoTxt] = args;
if (!metodo || !rota) {
  console.error('uso: node tools/oraculo-sql.mjs [--usuario email] MÉTODO /rota [corpo-json]');
  process.exit(1);
}

const CONTAINER = 'sisfin-modernizacao-legacy-db-1';
const mysql = (sql) =>
  execFileSync('docker', ['exec', CONTAINER, 'mysql', '-uroot', '-proot', '-N', '-B', '-e', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const api = criarCliente();
const usuario = { email, password: 'secret' };
await api.token(usuario); // login fora da janela observada

mysql("SET GLOBAL log_output='TABLE'; SET GLOBAL general_log='ON';");
const inicio = mysql('SELECT NOW(6)').trim();
const resp = await api.requisitar(usuario, metodo.toUpperCase(), rota, corpoTxt ? JSON.parse(corpoTxt) : undefined);
const linhas = mysql(
  `SELECT argument FROM mysql.general_log
   WHERE event_time >= '${inicio}' AND command_type IN ('Query','Execute')
     AND user_host LIKE 'sisfin%' ORDER BY event_time`,
)
  .split('\n')
  .map((l) => l.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

console.log(`## ${metodo.toUpperCase()} ${rota} → HTTP ${resp.status}  (usuário ${email})\n`);
console.log('```sql');
linhas.forEach((l, i) => console.log(`-- ${String(i + 1).padStart(2)}\n${l};`));
console.log('```');
const escritas = linhas.filter((l) => /^(insert|update|delete)\b/i.test(l));
console.log(`\n${linhas.length} comando(s), ${escritas.length} escrita(s). Transações abertas: ${linhas.filter((l) => /^(start transaction|begin)/i.test(l)).length}.`);
