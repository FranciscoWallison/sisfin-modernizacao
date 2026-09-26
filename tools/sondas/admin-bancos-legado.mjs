#!/usr/bin/env node
// Sonda do ADMIN DE BANCOS do LEGADO (Blade, sessão + CSRF, gate access-admin): login do admin, listagem, criar e
// editar com upload de logo (multipart), excluir, e acesso de não-admin / sem login. Evidência das regras RN-ADB-*.
//   node tools/sondas/admin-bancos-legado.mjs
import mysql from 'mysql2/promise';

const B = 'http://localhost:8081';
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33061, user: 'root', password: 'root', database: 'sisfin' });

function navegador() {
  const jar = new Map();
  const guardar = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const ir = async (metodo, url, corpo) => {
    const ehForm = corpo instanceof FormData;
    const r = await fetch(B + url, {
      method: metodo, redirect: 'manual',
      headers: { cookie: cookie(), ...(corpo && !ehForm ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: corpo ? (ehForm ? corpo : new URLSearchParams(corpo).toString()) : undefined,
    });
    guardar(r);
    return { status: r.status, local: r.headers.get('location'), texto: await r.text() };
  };
  const token = async (url) => /name="_token"[^>]*value="([^"]+)"/.exec((await ir('GET', url)).texto)?.[1];
  return { ir, token };
}
const png = () => new Blob([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex')], { type: 'image/png' });
const n = Date.now().toString(36);

// 1. sem login e não-admin
let r = await navegador().ir('GET', '/admin/banks');
console.log('1 sem login → GET /admin/banks', r.status, r.local);
const cliente = navegador();
let t = await cliente.token('/admin/login');
r = await cliente.ir('POST', '/admin/login', { _token: t, email: 'cliente1@user.com', password: 'secret' });
r = await cliente.ir('GET', '/admin/banks');
console.log('  cliente (não-admin) logado no admin → GET /admin/banks', r.status, r.local);

// 2. admin
const adm = navegador();
t = await adm.token('/admin/login');
r = await adm.ir('POST', '/admin/login', { _token: t, email: 'admin@user.com', password: 'secret' });
console.log('2 login admin →', r.status, r.local);
r = await adm.ir('GET', '/admin/banks');
const [nomes] = await db.query('SELECT name FROM banks ORDER BY id');
const naPagina = nomes.map((b) => b.name).filter((nome) => r.texto.includes(nome));
console.log('  GET /admin/banks →', r.status, `· ${nomes.length} bancos, ${naPagina.length} na 1ª página:`, JSON.stringify(naPagina), '· link p/ página 2?', /page=2/.test(r.texto));

// 3. criar banco (com logo)
t = await adm.token('/admin/banks/create');
let f = new FormData();
f.set('_token', t); f.set('name', `Banco Sonda ${n}`); f.set('logo', png(), 'logo.png');
r = await adm.ir('POST', '/admin/banks', f);
console.log('3 criar com logo →', r.status, r.local, r.status >= 500 ? (/(Class [^ ]+ does not exist)/.exec(r.texto)?.[1] ?? '') : '');
const [[criado]] = await db.query('SELECT id, name, logo FROM banks WHERE name = ?', [`Banco Sonda ${n}`]);
console.log('  no banco:', JSON.stringify(criado ?? null));

// 4. editar banco existente (id 1)
t = await adm.token('/admin/banks/1/edit');
f = new FormData();
f.set('_token', t); f.set('_method', 'PUT'); f.set('name', 'Novo Banco');
r = await adm.ir('POST', '/admin/banks/1', f);
console.log('4 editar banco 1 (só nome) →', r.status, r.local, r.status >= 500 ? (/(Class [^ ]+ does not exist)/.exec(r.texto)?.[1] ?? '') : '');

// 5. excluir: banco usado por contas bancárias e banco sem uso (criado direto no banco para a sonda)
const [[usado]] = await db.query('SELECT bank_id FROM bank_accounts LIMIT 1');
t = await adm.token('/admin/banks/create'); // a listagem exclui por componente Vue, sem _token no HTML
r = await adm.ir('POST', `/admin/banks/${usado.bank_id}`, { _token: t, _method: 'DELETE' });
const [[aindaExiste]] = await db.query('SELECT COUNT(*) n FROM banks WHERE id = ?', [usado.bank_id]);
console.log(`5 excluir banco ${usado.bank_id} (com contas) →`, r.status, r.local, '· ainda existe:', aindaExiste.n);
const [ins] = await db.query("INSERT INTO banks (name, logo, created_at, updated_at) VALUES (?, 'default.jpg', NOW(), NOW())", [`Banco Livre ${n}`]);
t = await adm.token('/admin/banks/create'); // a listagem exclui por componente Vue, sem _token no HTML
r = await adm.ir('POST', `/admin/banks/${ins.insertId}`, { _token: t, _method: 'DELETE' });
const [[sumiu]] = await db.query('SELECT COUNT(*) n FROM banks WHERE id = ?', [ins.insertId]);
console.log(`  excluir banco ${ins.insertId} (sem uso) →`, r.status, r.local, '· ainda existe:', sumiu.n);

// 6. logo padrão e arquivos
const [logos] = await db.query('SELECT logo, COUNT(*) n FROM banks GROUP BY logo ORDER BY n DESC LIMIT 3');
console.log('6 logos em uso:', JSON.stringify(logos));
await db.end();
