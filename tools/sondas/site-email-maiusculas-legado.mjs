#!/usr/bin/env node
// E-mail sem diferenciar maiúsculas no LEGADO (collation utf8_unicode_ci do MySQL) — RN-SIT-009:
// o cadastro recusa "CLIENTE1@USER.COM" como duplicado e o login da API aceita o e-mail em maiúsculas.
//   node tools/sondas/site-email-maiusculas-legado.mjs [base-da-api-para-comparar]
const B = 'http://localhost:8081';
const jar = new Map();
const ir = async (m, url, form) => { const r = await fetch(B + url, { method: m, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined }); for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } return r.text(); };
const tok = /name="_token"[^>]*value="([^"]+)"/.exec(await ir('GET', '/register'))[1];
await ir('POST', '/register', { _token: tok, name: 'x', email: 'CLIENTE1@USER.COM', password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': 'e', 'client[email]': 'e@e.com' });
console.log('cadastro com CLIENTE1@USER.COM →', JSON.stringify([...(await ir('GET', '/register')).matchAll(/data-error="([^"]+)"/g)].map((m) => m[1])));
for (const base of [B, process.argv[2]].filter(Boolean)) {
  const r = await fetch(`${base}/api/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'CLIENTE1@USER.COM', password: 'secret' }) });
  console.log(`login ${base} com CLIENTE1@USER.COM →`, r.status);
}
