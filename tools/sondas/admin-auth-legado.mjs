#!/usr/bin/env node
// Rotas de autenticação que o Auth::routes() registra sob /admin no LEGADO (RN-ADB-005): login, cadastro e
// recuperação de senha. Quem consegue se cadastrar pelo /admin/register, e com que papel e cliente?
//   node tools/sondas/admin-auth-legado.mjs
import mysql from 'mysql2/promise';

const B = 'http://localhost:8081';
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33061, user: 'root', password: 'root', database: 'sisfin' });
const jar = new Map();
const ir = async (m, url, form) => {
  const r = await fetch(B + url, { method: m, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
  return { status: r.status, local: r.headers.get('location'), texto: await r.text() };
};
for (const rota of ['/admin/login', '/admin/register', '/admin/password/reset']) {
  const r = await ir('GET', rota);
  console.log(`GET ${rota} →`, r.status, r.local ?? '');
}
const n = Date.now().toString(36);
const pagina = await ir('GET', '/admin/register');
const t = /name="_token"[^>]*value="([^"]+)"/.exec(pagina.texto)?.[1];
if (t) {
  const r = await ir('POST', '/admin/register', { _token: t, name: `Intruso ${n}`, email: `intruso-${n}@x.com`, password: 'segredo1', password_confirmation: 'segredo1' });
  const [[u]] = await db.query('SELECT id, role, client_id FROM users WHERE email = ?', [`intruso-${n}@x.com`]);
  console.log('POST /admin/register →', r.status, r.local, '· usuário criado:', JSON.stringify(u ?? null));
  const home = await ir('GET', '/admin/home');
  console.log('  depois, GET /admin/home →', home.status, home.local ?? '');
} else {
  console.log('sem formulário de cadastro no /admin/register');
}
await db.end();

// Recuperação de senha (RN-ADB-006): o e-mail sai (MAIL_DRIVER=log → laravel.log) com um link SEM o prefixo /admin.
import { execSync } from 'node:child_process';
jar.clear(); // a recuperação é só para visitante (middleware guest): sessão nova
const paginaReset = await ir('GET', '/admin/password/reset');
const tokenReset = /name="_token"[^>]*value="([^"]+)"/.exec(paginaReset.texto)?.[1];
const pedido = await ir('POST', '/admin/password/email', { _token: tokenReset, email: 'cliente1@user.com' });
console.log('POST /admin/password/email →', pedido.status, pedido.local);
const link = execSync('docker compose exec -T legacy-app sh -c "grep -o \'http://localhost:8081/[a-z/]*password/reset/[a-f0-9]*\' storage/logs/laravel.log | tail -1"').toString().trim();
console.log('  link no e-mail:', link.replace(/[a-f0-9]{8}[a-f0-9]*$/, '<token>'));
console.log('  GET do link do e-mail →', (await fetch(link, { redirect: 'manual' })).status);
console.log('  GET com /admin acrescentado à mão →', (await fetch(link.replace('8081/', '8081/admin/'), { redirect: 'manual' })).status);
