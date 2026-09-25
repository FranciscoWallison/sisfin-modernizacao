// globalSetup do E2E: espera a API e o site responderem antes do 1º teste. Sem isto, logo depois de um
// `docker compose up --build` o primeiro teste pegava a API ainda subindo (fetch falha → nenhuma mensagem por campo).
const esperar = async (url: string, limiteMs = 60_000) => {
  const fim = Date.now() + limiteMs;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* ainda subindo */
    }
    if (Date.now() > fim) throw new Error(`${url} não respondeu em ${limiteMs / 1000}s — o compose está no ar?`);
    await new Promise((ok) => setTimeout(ok, 1_000));
  }
};

export default async function prontidao(): Promise<void> {
  const api = process.env.API_URL ?? 'http://localhost:3300/api';
  await esperar(`${api.replace(/\/api$/, '')}/health`);
  await esperar(process.env.SITE_URL ?? 'http://localhost:8083');
}
