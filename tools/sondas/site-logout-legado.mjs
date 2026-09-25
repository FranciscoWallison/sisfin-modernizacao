#!/usr/bin/env node
// Site do LEGADO: senha CERTA depois de 7 erradas continua bloqueada (RN-SIT-004); logout encerra a sessão (RN-SIT-007).
//   node tools/sondas/site-logout-legado.mjs
const B = 'http://localhost:8081';
function navegador() {
  const jar = new Map();
  const guardar = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  const ir = async (metodo, url, form) => {
    const r = await fetch(B + url, { method: metodo, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
    guardar(r);
    return { status: r.status, local: r.headers.get('location'), texto: await r.text() };
  };
  const token = async (url) => /name="_token"[^>]*value="([^"]+)"/.exec((await ir('GET', url)).texto)?.[1];
  return { ir, token };
}
const mensagens = (html) => [...new Set([...html.matchAll(/<(?:strong|span|p|div)[^>]*>\s*([^<]*(?:credenciais|credentials|tentativas|attempts|seconds|segundos|incorret|match)[^<]*)</gi)].map((m) => m[1].trim()))];

const nav = navegador();
for (let i = 1; i <= 7; i++) {
  const t = await nav.token('/login');
  const r = await nav.ir('POST', '/login', { _token: t, email: 'cliente3@user.com', password: 'errada' });
  const volta = await nav.ir('GET', '/login');
  console.log(`tentativa errada ${i} →`, r.status, JSON.stringify(mensagens(volta.texto)));
}
let t = await nav.token('/login');
let r = await nav.ir('POST', '/login', { _token: t, email: 'cliente3@user.com', password: 'secret' });
console.log('senha CERTA depois das erradas →', r.status, r.local, JSON.stringify(mensagens((await nav.ir('GET', '/login')).texto)));

const nav2 = navegador();
t = await nav2.token('/login');
await nav2.ir('POST', '/login', { _token: t, email: 'cliente1@user.com', password: 'secret' });
t = await nav2.token('/register'); // a mesma sessão: qualquer formulário dá o token dela
r = await nav2.ir('POST', '/logout', { _token: t });
console.log('logout →', r.status, r.local);
r = await nav2.ir('GET', '/subscriptions/create');
console.log('depois do logout, área logada →', r.status, r.local);
