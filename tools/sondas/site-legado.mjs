#!/usr/bin/env node
// Sonda do site do LEGADO (Blade, sessão + CSRF): cadastro, API sem assinatura, validações, login, ponte JWT→sessão,
// convite e logout. Evidência das regras RN-SIT-* (.specs/legado/modulos/site/regras.md). Só o seed fictício.
//   node tools/sondas/site-legado.mjs

import mysql from 'mysql2/promise';
const B = 'http://localhost:8081';
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33061, user: 'root', password: 'root', database: 'sisfin' });

function navegador() {
  const jar = new Map();
  const guardar = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const ir = async (metodo, url, form, extra = {}) => {
    const r = await fetch(B + url, {
      method: metodo, redirect: 'manual',
      headers: { cookie: cookie(), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...extra },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    guardar(r);
    const texto = await r.text();
    return { status: r.status, local: r.headers.get('location'), texto };
  };
  const token = async (url) => /name="_token"[^>]*value="([^"]+)"/.exec((await ir('GET', url)).texto)?.[1];
  return { ir, token, jar };
}
const erros = (html) => [...html.matchAll(/class="[^"]*(?:help-block|error|red-text|invalid)[^"]*"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{3,200})/g)].map((m) => m.group?.[1] ?? m[1].trim()).slice(0, 6);
const n = Date.now().toString(36);

// 1. cadastro válido
let nav = navegador();
let t = await nav.token('/register');
let r = await nav.ir('POST', '/register', { _token: t, name: `Sonda ${n}`, email: `sonda-${n}@x.com`, password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': `Empresa ${n}`, 'client[email]': 'nao-e-email' });
console.log('1 cadastro válido (client.email "nao-e-email") →', r.status, r.local);
const [[u]] = await db.query('SELECT u.id, u.client_id, u.password, u.role, c.name cn, c.email ce, c.code FROM users u JOIN clients c ON c.id = u.client_id WHERE u.email = ?', [`sonda-${n}@x.com`]);
console.log('  banco:', JSON.stringify({ ...u, password: u.password.slice(0, 7) + '…' }));
r = await nav.ir('GET', '/subscriptions/create');
console.log('  sessão aberta? GET /subscriptions/create →', r.status, r.local ?? '');

// 2. o novo usuário usa a API sem assinatura?
const tok = await (await fetch(B + '/api/access_token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `sonda-${n}@x.com`, password: 'segredo1' }) })).json();
const ba = await fetch(B + '/api/bank_accounts', { headers: { authorization: `Bearer ${tok.token}`, accept: 'application/json' } });
console.log('2 API sem assinatura: token?', !!tok.token, '· GET /api/bank_accounts →', ba.status, (await ba.text()).slice(0, 80));

// 3. validações do cadastro
nav = navegador();
for (const [nome, corpo] of [
  ['email duplicado', { name: 'x', email: 'cliente1@user.com', password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['senha curta + confirmação diferente', { name: 'x', email: `a-${n}@x.com`, password: '123', password_confirmation: '999', 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['senha com 21 caracteres', { name: 'x', email: `b-${n}@x.com`, password: 'a'.repeat(21), password_confirmation: 'a'.repeat(21), 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['sem cliente', { name: 'x', email: `c-${n}@x.com`, password: 'segredo1', password_confirmation: 'segredo1' }],
]) {
  t = await nav.token('/register');
  r = await nav.ir('POST', '/register', { _token: t, ...corpo });
  const volta = await nav.ir('GET', '/register');
  console.log(`3 ${nome} →`, r.status, r.local, '·', JSON.stringify(erros(volta.texto)));
}
const [[{ clientes }]] = await db.query("SELECT COUNT(*) clientes FROM clients WHERE name = 'e'");
console.log('  clientes "e" criados pelas tentativas inválidas:', clientes);

// 4. sem CSRF
r = await navegador().ir('POST', '/register', { name: 'x', email: `d-${n}@x.com`, password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': 'e', 'client[email]': 'e@e.com' });
console.log('4 cadastro sem _token →', r.status);

// 5. login do site: ok, errado, throttle
nav = navegador();
t = await nav.token('/login');
r = await nav.ir('POST', '/login', { _token: t, email: 'cliente1@user.com', password: 'secret' });
console.log('5 login ok →', r.status, r.local);
const nav2 = navegador();
for (let i = 1; i <= 7; i++) {
  t = await nav2.token('/login');
  r = await nav2.ir('POST', '/login', { _token: t, email: `sonda-${n}@x.com`, password: 'errada' });
  const volta = await nav2.ir('GET', '/login');
  if (i === 1 || i >= 5) console.log(`  tentativa errada ${i} →`, r.status, r.local, JSON.stringify(erros(volta.texto)).slice(0, 160));
}

// 6. ponte SPA → site com o JWT na URL, e o "convite"
nav = navegador();
const tokA = (await (await fetch(B + '/api/access_token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cliente1@user.com', password: 'secret' }) })).json()).token;
r = await nav.ir('GET', `/my-financial?token=${tokA}`);
console.log('6 GET /my-financial?token=JWT →', r.status, r.texto.slice(0, 20));
r = await nav.ir('GET', '/my-financial/invite');
console.log('  depois, sem token (sessão aberta pela ponte) → /my-financial/invite', r.status);
t = /name="_token"[^>]*value="([^"]+)"/.exec(r.texto)?.[1];
r = await nav.ir('POST', '/my-financial/invite', { _token: t, name: `Convidado ${n}`, email: `conv-${n}@x.com`, password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': `ClienteConv ${n}`, 'client[email]': `conv-${n}@x.com` });
const [[cv]] = await db.query('SELECT u.client_id FROM users u WHERE u.email = ?', [`conv-${n}@x.com`]);
const [[a]] = await db.query("SELECT client_id FROM users WHERE email = 'cliente1@user.com'");
console.log('  POST convite →', r.status, r.local, '· cliente do convidado', cv?.client_id, '× cliente de quem convidou', a.client_id);
r = await nav.ir('GET', '/subscriptions/create');
console.log('  sessão agora é de quem? GET /subscriptions/create →', r.status, (/(Convidado [^<]+|Cliente 1)/.exec(r.texto) ?? [''])[0]);

// 7. logout
t = /name="_token"[^>]*value="([^"]+)"/.exec((await nav.ir('GET', '/subscriptions/create')).texto)?.[1];
r = await nav.ir('POST', '/logout', { _token: t });
console.log('7 logout →', r.status, r.local);
await db.end();
