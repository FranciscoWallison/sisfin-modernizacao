// S03–S05 — o site novo de ponta a ponta no navegador (REQ-SIT-01, 04, 05, 06, 07). Com o compose no ar.
import { expect, test, type Page } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:3300/api';
const IMGS = '../docs/imgs';
const unico = () => `e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function entrarComo(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Login' }).click();
}

test('cadastro vazio → as cinco mensagens do legado, cada uma no seu campo (REQ-SIT-05)', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  const erro = (campo: string) => page.locator(`[data-campo="${campo}"]`);
  await expect(erro('name')).toHaveText('The name field is required.');
  await expect(erro('email')).toHaveText('The email field is required.');
  await expect(erro('password')).toHaveText('The password field is required.');
  await expect(erro('client.name')).toHaveText('The client.name field is required.');
  await expect(erro('client.email')).toHaveText('The client.email field is required.');
  await page.screenshot({ path: `${IMGS}/web-cadastro-erros.png`, fullPage: true });
});

test('cadastro válido → cai no app JÁ LOGADO, com o nome no menu e o dashboard carregando (REQ-SIT-01, 05)', async ({ page }) => {
  const id = unico();
  await page.goto('/register');
  const dados = page.getByRole('group', { name: 'Seus dados' });
  const empresa = page.getByRole('group', { name: 'Sua empresa' });
  await dados.getByLabel('Nome').fill(`Pessoa ${id}`);
  await dados.getByLabel('E-mail').fill(`${id}@exemplo.com`);
  await page.getByLabel('Senha', { exact: true }).fill('segredo1');
  await page.getByLabel('Confirmar senha').fill('segredo1');
  await empresa.getByLabel('Nome').fill(`Empresa ${id}`);
  await empresa.getByLabel('E-mail').fill(`empresa-${id}@exemplo.com`);
  await page.screenshot({ path: `${IMGS}/web-cadastro.png`, fullPage: true });
  const dashboard = page.waitForResponse((r) => r.url().includes('/api/bank_accounts') && r.status() === 200);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.waitForURL('**/app**');
  await dashboard;
  await expect(page.getByText(`Pessoa ${id}`).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user') ?? 'null')?.name)).toBe(`Pessoa ${id}`);
  await page.screenshot({ path: `${IMGS}/web-cadastro-no-app.png` });
});

test('login errado mostra a mensagem da API; certo leva ao app (REQ-SIT-04)', async ({ page }) => {
  await entrarComo(page, 'cliente1@user.com', 'errada');
  await expect(page.getByRole('alert')).toHaveText('These credentials do not match our records.');
  await page.screenshot({ path: `${IMGS}/web-login-erro.png` });
  await entrarComo(page, 'CLIENTE1@USER.COM', 'secret'); // e-mail em maiúsculas, como o legado aceita (RN-SIT-009)
  await page.waitForURL('**/app**');
});

test('/my-financial?token=… → a URL final NÃO tem o token; a página usa a sessão do localStorage (REQ-SIT-06)', async ({ page }) => {
  await entrarComo(page, 'cliente1@user.com', 'secret');
  await page.waitForURL('**/app**');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const resposta = await page.goto(`/my-financial?token=${token}`);
  expect(resposta!.headers()['referrer-policy']).toBe('no-referrer');
  // revisão de segurança do site (S4): sem iframe (clickjacking), CSP estrita — e a página FUNCIONA com ela
  expect(resposta!.headers()['x-frame-options']).toBe('DENY');
  expect(resposta!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(resposta!.headers()['cache-control']).toBe('no-store');
  await expect(page.locator('[data-teste="usuario"]')).toContainText('cliente1@user.com');
  expect(page.url()).not.toContain('token=');
  await page.screenshot({ path: `${IMGS}/web-minha-conta.png` });
});

test('sair → volta ao login e o token deixa de valer na API (REQ-SIT-04)', async ({ page, request }) => {
  await entrarComo(page, 'cliente1@user.com', 'secret');
  await page.waitForURL('**/app**');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  await page.goto('/my-financial');
  await expect(page.locator('[data-teste="usuario"]')).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL('**/login');
  expect(await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('user')])).toEqual([null, null]);
  const r = await request.get(`${API}/user`, { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status()).toBe(401);
});

test('sem sessão, /my-financial manda para o login', async ({ page }) => {
  await page.goto('/my-financial');
  await page.waitForURL('**/login');
});

test('/my-financial/invite não existe: o convite não é migrado (REQ-SIT-07)', async ({ page }) => {
  await page.goto('/my-financial/invite');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
