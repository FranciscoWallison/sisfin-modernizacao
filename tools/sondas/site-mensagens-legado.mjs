#!/usr/bin/env node
// Mensagens de validação do cadastro do site do LEGADO (lidas do atributo data-error do Materialize) — RN-SIT-002.
//   node tools/sondas/site-mensagens-legado.mjs
const B = 'http://localhost:8081';
const jar = new Map();
const ir = async (m, url, form) => { const r = await fetch(B + url, { method: m, redirect: 'manual', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined }); for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } return r.text(); };
const tok = async () => /name="_token"[^>]*value="([^"]+)"/.exec(await ir('GET', '/register'))[1];
const n = Date.now().toString(36);
for (const [nome, corpo] of [
  ['vazio', {}],
  ['email duplicado', { name: 'x', email: 'cliente1@user.com', password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['senha curta + confirmação diferente', { name: 'x', email: `a-${n}@x.com`, password: '123', password_confirmation: '999', 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['senha 21', { name: 'x', email: `b-${n}@x.com`, password: 'a'.repeat(21), password_confirmation: 'a'.repeat(21), 'client[name]': 'e', 'client[email]': 'e@e.com' }],
  ['email inválido', { name: 'x', email: 'nao-e-email', password: 'segredo1', password_confirmation: 'segredo1', 'client[name]': 'e', 'client[email]': 'e@e.com' }],
]) {
  await ir('POST', '/register', { _token: await tok(), ...corpo });
  const html = await ir('GET', '/register');
  console.log(nome, JSON.stringify([...html.matchAll(/data-error="([^"]+)"/g)].map((m) => m[1])));
}
