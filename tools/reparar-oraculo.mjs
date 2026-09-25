#!/usr/bin/env node
// Desfaz no ORÁCULO, pela própria API do legado, o estrago que os casos de paridade RN-CAT-003 e RN-CAT-009 provocam
// de propósito: categoria movida para a árvore de outro cliente e categoria órfã. O dono de cada categoria faz um PUT
// sem parent_id, e ela volta a ser raiz (RN-CAT-007). Nenhuma escrita direta no banco: é o que um usuário faria.
//
//   node tools/reparar-oraculo.mjs          (depois de rodar a paridade no legado, antes do ETL)
//
// Só serve ao seed fictício (usuários com senha "secret"). O ETL acusa essas árvores e sai com erro — ver
// "Árvores de categorias entre clientes" e "Categorias órfãs" no relatório.
import mysql from 'mysql2/promise';
import { criarCliente } from './lib/api.mjs';

const ORIGEM = process.env.LEGACY_DATABASE_URL ?? 'mysql://root:root@localhost:33061/sisfin';
const BASE = process.env.LEGACY_URL ?? 'http://localhost:8081';

const db = await mysql.createConnection(ORIGEM);
const api = criarCliente(BASE);
const emailDoCliente = new Map();
let reparadas = 0;

for (const tabela of ['category_expenses', 'category_revenues']) {
  for (;;) {
    // uma por vez: cada makeRoot renumera o nested set do legado
    const [linhas] = await db.query(`
      SELECT c.id, c.name, c.client_id FROM ${tabela} c LEFT JOIN ${tabela} p ON p.id = c.parent_id
      WHERE c.parent_id IS NOT NULL AND (p.id IS NULL OR p.client_id <> c.client_id) ORDER BY c.id LIMIT 1`);
    if (!linhas.length) break;
    const c = linhas[0];
    if (!emailDoCliente.has(c.client_id)) {
      const [[u]] = await db.query('SELECT email FROM users WHERE client_id = ? ORDER BY id LIMIT 1', [c.client_id]);
      emailDoCliente.set(c.client_id, u.email);
    }
    const r = await api.requisitar({ email: emailDoCliente.get(c.client_id), password: 'secret' }, 'PUT', `/api/${tabela}/${c.id}`, { name: c.name });
    if (r.status !== 200) {
      console.error(`❌ ${tabela} ${c.id}: PUT respondeu ${r.status}`);
      process.exitCode = 1;
      break;
    }
    console.log(`🔧 ${tabela} ${c.id} (cliente ${c.client_id}) → raiz`);
    reparadas++;
  }
}
console.log(`${reparadas} categoria(s) reparada(s)`);
await db.end();
