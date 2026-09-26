// P06 — assinatura de ponta a ponta com o SIMULADOR (REQ-ASS-06; ADR-011). Com o compose no ar. O pagamento chega
// como no Stripe de verdade: um evento ASSINADO no webhook (aqui, com o segredo só local do simulador).
import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:3300/api';
const IMGS = '../docs/imgs';
// O segredo PÚBLICO do simulador (api/src/shared/config/config.ts) — a API o recusa em produção
const SEGREDO_DO_WEBHOOK = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_simulador_local_nao_usar_em_producao';
const unico = () => `e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Cliente novo pela API de cadastro (o E2E do site já cobre a tela de cadastro). */
async function novoCliente(request: APIRequestContext) {
  const id = unico();
  const r = await request.post(`${API}/register`, {
    data: { name: `Pessoa ${id}`, email: `${id}@exemplo.com`, password: 'segredo1', password_confirmation: 'segredo1', client: { name: `Empresa ${id}`, email: `empresa-${id}@exemplo.com` } },
  });
  expect(r.status()).toBe(201);
  const token = (await r.json()).token as string;
  const eu = await (await request.get(`${API}/user`, { headers: { Authorization: `Bearer ${token}` } })).json();
  return { email: `${id}@exemplo.com`, clienteId: eu.client_id as number };
}

async function entrarComo(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Senha').fill('segredo1');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/app**');
}

/** Envia um evento no formato do Stripe, com o cabeçalho Stripe-Signature (t=…,v1=HMAC-SHA256 de "t.corpo"). */
async function webhook(request: APIRequestContext, tipo: string, assinatura: Record<string, unknown>) {
  const corpo = JSON.stringify({
    id: `evt_${unico()}`, object: 'event', type: tipo, created: Math.floor(Date.now() / 1000),
    data: { object: { object: 'subscription', cancel_at_period_end: false, canceled_at: null, ...assinatura } },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SEGREDO_DO_WEBHOOK).update(`${t}.${corpo}`).digest('hex');
  return request.post(`${API}/hooks/stripe`, { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` }, data: corpo });
}

test('assinar: plano → Checkout (simulador) → webhook assinado → ativa em "Minha conta" → portal (REQ-ASS-06)', async ({ page, request }) => {
  const c = await novoCliente(request);
  await entrarComo(page, c.email);

  await page.goto('/my-financial');
  await expect(page.locator('[data-teste="assinatura"]')).toHaveText('Sua empresa ainda não tem assinatura.');
  await page.getByRole('link', { name: 'Assinar' }).click();
  await page.waitForURL('**/subscriptions/create');
  await expect(page.locator('[data-teste="plano"]')).toHaveText('Plano Empresarial');
  await expect(page.locator('[data-teste="preco"]')).toContainText('40,00');
  await page.screenshot({ path: `${IMGS}/web-assinatura-plano.png`, fullPage: true });

  await page.getByRole('button', { name: 'Assinar' }).click();
  await page.waitForURL('**/subscriptions/successfully**');
  await expect(page.locator('[data-teste="situacao"]')).toHaveText('Pagamento em processamento…');

  const r = await webhook(request, 'customer.subscription.created', {
    id: `sub_${unico()}`, customer: `cus_sim_${c.clienteId}`, status: 'active',
    items: { object: 'list', data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
  });
  expect(r.status()).toBe(200);
  await expect(page.locator('[data-teste="situacao"]')).toHaveText('Assinatura ativa! Obrigado.');
  await page.screenshot({ path: `${IMGS}/web-assinatura-ativa.png`, fullPage: true });

  await page.goto('/my-financial');
  await expect(page.locator('[data-teste="assinatura"]')).toContainText('Ativa — Plano Empresarial');
  await page.getByRole('button', { name: 'Gerenciar assinatura' }).click();
  await page.waitForURL('**/my-financial?portal=simulador');
  await page.screenshot({ path: `${IMGS}/web-assinatura-minha-conta.png`, fullPage: true });

  // quem já assina não abre outro checkout
  await page.goto('/subscriptions/create');
  await expect(page.getByText('Sua empresa já tem uma assinatura ativa.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assinar' })).toHaveCount(0);
});

test('webhook com assinatura inválida → 400 (o da Iugu, no legado, era público)', async ({ request }) => {
  const r = await request.post(`${API}/hooks/stripe`, {
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' },
    data: JSON.stringify({ id: 'evt_x', type: 'customer.subscription.created', data: { object: {} } }),
  });
  expect(r.status()).toBe(400);
});

test('/testasdasdasdasdasdas não existe no novo (RN-ASS-008)', async ({ page }) => {
  await page.goto('/testasdasdasdasdasdas');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
