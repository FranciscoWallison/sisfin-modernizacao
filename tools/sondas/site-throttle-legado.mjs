#!/usr/bin/env node
// Throttle do login do site do LEGADO: 5 erros → bloqueio de 60 s, inclusive para a senha certa — RN-SIT-004.
//   node tools/sondas/site-throttle-legado.mjs <email do seed>
const B = 'http://localhost:8081';
const jar = new Map();
const ir = async (m, url, form) => { const r = await fetch(B + url, { method: m, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined }); for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } return r.text(); };
const tok = async () => /name="_token"[^>]*value="([^"]+)"/.exec(await ir('GET', '/login'))[1];
const email = process.argv[2];
for (let i = 1; i <= 6; i++) {
  await ir('POST', '/login', { _token: await tok(), email, password: 'errada' });
  const html = await ir('GET', '/login');
  const form = JSON.stringify([...html.matchAll(/data-error='([^']*)'|data-error="([^"]+)"/g)].map((m) => m[1] ?? m[2]));
  if (i === 1 || i >= 5) console.log(i, form.slice(0, 220));
}
