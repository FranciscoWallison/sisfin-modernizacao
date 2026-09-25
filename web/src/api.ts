// Chamadas à API nova. A base vem do build (VITE_API_URL), como o SPA fixa a dele (docker/spa/Dockerfile).

export type ErrosPorCampo = Record<string, string[]>;

/** Resultado de uma chamada: ok com o corpo, ou erro com mensagens por campo e/ou uma mensagem geral. */
export type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; campos: ErrosPorCampo; geral: string | null };

/**
 * Traduz o corpo de erro da API para a tela:
 * - 422 no formato do Laravel `{ "campo": ["mensagem"] }` → mensagens por campo (a chave aninhada fica "client.name");
 * - `{ "message": "…" }` (400 credencial, 403 bloqueio, 429 limite) → mensagem geral.
 */
export function interpretarErro(status: number, corpo: unknown): { campos: ErrosPorCampo; geral: string | null } {
  const campos: ErrosPorCampo = {};
  let geral: string | null = null;
  if (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) {
    for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
      if (chave === 'message' && typeof valor === 'string') geral = valor;
      else if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) campos[chave] = valor as string[];
    }
  }
  if (!geral && !Object.keys(campos).length) geral = status === 429 ? 'Too Many Attempts.' : 'Não foi possível concluir. Tente de novo.';
  return { campos, geral };
}

export async function chamar<T>(
  metodo: 'GET' | 'POST',
  caminho: string,
  opcoes: { corpo?: unknown; token?: string | null; base?: string; fetch?: typeof fetch } = {},
): Promise<Resultado<T>> {
  const base = opcoes.base ?? import.meta.env.VITE_API_URL;
  const f = opcoes.fetch ?? fetch;
  const r = await f(`${base}${caminho}`, {
    method: metodo,
    headers: {
      Accept: 'application/json',
      ...(opcoes.corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      // o token vai SEMPRE no cabeçalho, nunca na URL (REQ-SIT-06)
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  const texto = await r.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (r.ok) return { ok: true, dados: corpo as T };
  return { ok: false, status: r.status, ...interpretarErro(r.status, corpo) };
}
