#!/usr/bin/env node
// Sonda das ASSINATURAS do legado (Blade + Iugu): tela do plano, validação, criação com a Iugu sem chave (o oráculo
// não tem conta Iugu — IUGU_API_KEY vazia no compose), webhook sem autenticação e o gate de assinatura.
// Evidência das regras RN-ASS-* (.specs/legado/modulos/assinaturas/regras.md). Só o seed fictício.
//   node tools/sondas/assinaturas-legado.mjs

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
    return { status: r.status, local: r.headers.get('location'), texto: await r.text() };
  };
  // o token CSRF do layout (meta) serve para qualquer formulário da sessão
  const token = async (url) => {
    const html = (await ir('GET', url)).texto;
    return /name="_token"[^>]*value="([^"]+)"/.exec(html)?.[1] ?? /csrf_token="([^"]+)"/.exec(html)?.[1] ?? /name="csrf-token" content="([^"]+)"/.exec(html)?.[1];
  };
  return { ir, token };
}
const contar = async () => {
  const [[s]] = await db.query('SELECT (SELECT COUNT(*) FROM subscriptions) subs, (SELECT COUNT(*) FROM orders) orders, (SELECT COUNT(*) FROM clients WHERE code IS NOT NULL) clientes_com_code');
  return JSON.stringify(s);
};
const erroNaTela = (html) => /card-panel red[\s\S]*?white-text">([^<]+)/.exec(html)?.[1]?.trim() ?? null;

console.log('0 banco antes:', await contar());

// 1. tela do plano: visitante e logado
let nav = navegador();
let r = await nav.ir('GET', '/subscriptions/create');
console.log('1 visitante GET /subscriptions/create →', r.status, r.local);
let t = await nav.token('/login');
await nav.ir('POST', '/login', { _token: t, email: 'cliente1@user.com', password: 'secret' });
r = await nav.ir('GET', '/subscriptions/create');
console.log('  logado →', r.status, '· plano na página:', /:plan="([^"]+)"/.exec(r.texto)?.[1]?.replaceAll('&quot;', '"') ?? '(não achado)');
console.log('  carrega iugu.js?', r.texto.includes('js.iugu.com'));

// 2. validação (SubscriptionCreateRequest)
t = await nav.token('/subscriptions/create');
for (const [nome, corpo] of [
  ['sem payment_type', {}],
  ['payment_type inválido', { payment_type: 'pix' }],
  ['cartão sem token', { payment_type: 'credit_card' }],
]) {
  r = await nav.ir('POST', '/subscriptions/store', { _token: t, ...corpo });
  console.log(`2 ${nome} →`, r.status, r.local);
}

// 3. criar com boleto e com cartão, sem conta Iugu (chave vazia)
for (const corpo of [{ payment_type: 'bank_slip' }, { payment_type: 'credit_card', token_payment: 'tok-falso' }]) {
  r = await nav.ir('POST', '/subscriptions/store', { _token: t, ...corpo });
  const volta = r.status === 302 ? await nav.ir('GET', new URL(r.local).pathname) : null;
  console.log(`3 store ${corpo.payment_type} →`, r.status, r.local ?? '', '· mensagem:', volta ? erroNaTela(volta.texto) : r.texto.slice(0, 120).replace(/\s+/g, ' '));
}
console.log('  banco depois:', await contar());

// 4. webhook: sem autenticação, sem CSRF (rota da API)
for (const corpo of [
  { event: 'evento.qualquer', data: {} },
  { event: 'invoice.status_changed', data: { id: 'x', status: 'pending' } },
  { event: 'invoice.created', data: { subscription_id: 'nao-existe' } },
  { event: 'subscription.renewed', data: { id: 'nao-existe' } },
]) {
  const w = await fetch(B + '/api/hooks/iugu', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corpo) });
  const texto = await w.text();
  console.log(`4 webhook ${corpo.event} →`, w.status, texto.slice(0, 100).replace(/\s+/g, ' '));
}

// 5. o gate de assinatura: cliente sem assinatura usa a API?
const tok = (await (await fetch(B + '/api/access_token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cliente1@user.com', password: 'secret' }) })).json()).token;
const ba = await fetch(B + '/api/bank_accounts', { headers: { authorization: `Bearer ${tok}`, accept: 'application/json' } });
console.log('5 cliente SEM assinatura → GET /api/bank_accounts', ba.status);

await db.end();
