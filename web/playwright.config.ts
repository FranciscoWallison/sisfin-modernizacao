import { defineConfig } from '@playwright/test';

// E2E do site novo contra o ambiente local (docker compose: :8083 = app + site; :3300 = API). Chrome instalado
// (channel), headless e com PERFIL LIMPO a cada teste — sem gerenciador de senhas nem sessão antiga no caminho.
//   npx playwright test            (com o compose no ar)
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  globalTimeout: 240_000,
  globalSetup: './e2e/prontidao.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // o limite de requisições da API é por IP: em série, sem estourar
  reporter: [['list']],
  use: {
    baseURL: process.env.SITE_URL ?? 'http://localhost:8083',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
});
