// A05 — telas de admin de bancos de ponta a ponta (REQ-ADB-02, 07; ADR-010). Com o compose no ar.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:3300/api';
const IMGS = '../docs/imgs';
const unico = () => `e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
// PNG 1×1 VÁLIDO e opaco, na cor do app (o navegador precisa decodificar para a imagem aparecer)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQqzUCAAG6AN7Eir+IAAAAAElFTkSuQmCC', 'base64');

async function entrarComo(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Senha').fill('secret');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/app**');
}

const token = async (request: APIRequestContext, email: string) =>
  (await (await request.post(`${API}/access_token`, { data: { email, password: 'secret' } })).json()).token as string;

/** Avança a paginação até a linha do banco aparecer (bancos novos ficam no fim: ordem de id). */
async function irAteOBanco(page: Page, nome: string) {
  const linha = page.locator(`tr[data-banco="${nome}"]`);
  await expect(page.getByText(/Página \d+ de \d+/)).toBeVisible();
  while (!(await linha.isVisible())) await page.getByRole('link', { name: 'Próxima' }).click();
  return linha;
}

test('admin: cria com PNG e vê o logo, recusa texto disfarçado, edita e exclui (REQ-ADB-03, 04, 07)', async ({ page }) => {
  const nome = `Banco ${unico()}`;
  await entrarComo(page, 'admin@user.com');
  await page.goto('/my-financial');
  await page.getByRole('link', { name: 'Administração de bancos' }).click();
  await page.waitForURL('**/admin/banks');
  await page.getByRole('link', { name: 'Novo banco' }).click();

  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel(/^Logo/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('não sou imagem') });
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('[data-campo="logo"]')).toHaveText('The logo must be a PNG, JPEG or WebP image up to 1 MB.');
  await page.screenshot({ path: `${IMGS}/web-admin-banco-logo-invalido.png`, fullPage: true });

  await page.getByLabel(/^Logo/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForURL('**/admin/banks');
  const linha = await irAteOBanco(page, nome);
  const logo = linha.getByRole('img');
  await expect(logo).toHaveAttribute('src', /\/storage\/banks\/imagens\/[0-9a-f]{32}\.png$/);
  await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1);
  const src = await logo.getAttribute('src');
  await page.screenshot({ path: `${IMGS}/web-admin-bancos.png`, fullPage: true });

  await linha.getByRole('link', { name: 'Editar' }).click();
  await expect(page.getByLabel('Nome')).toHaveValue(nome);
  await expect(page.getByAltText('Logo atual')).toBeVisible();
  await page.getByLabel('Nome').fill(`${nome} editado`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForURL('**/admin/banks');
  const editada = await irAteOBanco(page, `${nome} editado`);
  await expect(editada.getByRole('img')).toHaveAttribute('src', src!); // sem arquivo, o logo fica

  page.once('dialog', (d) => d.accept());
  await editada.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator(`tr[data-banco="${nome} editado"]`)).toHaveCount(0);
});

test('banco em uso: a exclusão mostra a mensagem da API e o banco fica (REQ-ADB-05)', async ({ page, request }) => {
  const nome = `Em uso ${unico()}`;
  const admin = { Authorization: `Bearer ${await token(request, 'admin@user.com')}` };
  const cliente = { Authorization: `Bearer ${await token(request, 'cliente1@user.com')}` };
  const banco = (await (await request.post(`${API}/admin/banks`, { headers: admin, multipart: { name: nome } })).json()).data;
  const conta = (await (await request.post(`${API}/bank_accounts`, { headers: cliente, data: { name: nome, agency: '1', account: '2', bank_id: banco.id } })).json()).data;
  try {
    await entrarComo(page, 'admin@user.com');
    await page.goto('/admin/banks');
    const linha = await irAteOBanco(page, nome);
    page.once('dialog', (d) => d.accept());
    await linha.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('alert')).toHaveText('Bank has bank accounts.');
    await expect(linha).toBeVisible();
    await page.screenshot({ path: `${IMGS}/web-admin-banco-em-uso.png`, fullPage: true });
  } finally {
    await request.delete(`${API}/bank_accounts/${conta.id}`, { headers: cliente });
    await request.delete(`${API}/admin/banks/${banco.id}`, { headers: admin });
  }
});

test('cliente comum: sem link em "Minha conta" e acesso negado nas telas de admin (REQ-ADB-02, 07)', async ({ page }) => {
  await entrarComo(page, 'cliente1@user.com');
  await page.goto('/my-financial');
  await expect(page.locator('[data-teste="usuario"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administração de bancos' })).toHaveCount(0);
  for (const url of ['/admin/banks', '/admin/banks/novo', '/admin/banks/1']) {
    await page.goto(url);
    await expect(page.getByRole('alert')).toHaveText('Acesso negado: esta área é só para administradores.');
  }
  await page.screenshot({ path: `${IMGS}/web-admin-acesso-negado.png` });
});

test('/admin/register e /admin/password/reset não existem no novo (REQ-ADB-02, 07)', async ({ page }) => {
  for (const url of ['/admin/register', '/admin/password/reset']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  }
});
