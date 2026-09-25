// Cliente HTTP mínimo da API do SisFin (legado ou novo — mesmo contrato).
export const BASE_PADRAO = 'http://localhost:8081';

export function criarCliente(base = BASE_PADRAO) {
  const tokens = new Map();

  async function token(usuario) {
    if (!tokens.has(usuario.email)) {
      const r = await fetch(`${base}/api/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(usuario),
      });
      if (!r.ok) throw new Error(`login de ${usuario.email} falhou: HTTP ${r.status}`);
      tokens.set(usuario.email, (await r.json()).token);
    }
    return tokens.get(usuario.email);
  }

  async function requisitar(usuario, metodo, rota, corpo) {
    const r = await fetch(base + rota, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${await token(usuario)}`,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = { _naoJson: texto.slice(0, 300) };
    }
    return { status: r.status, corpo: json };
  }

  return { token, requisitar };
}
