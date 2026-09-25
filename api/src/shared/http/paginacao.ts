// Paginação no formato do Fractal (l5-repository) usado pelo legado — contrato.md.
export const POR_PAGINA = 15;

export interface MetaPaginacao {
  pagination: {
    total: number;
    count: number;
    per_page: number;
    current_page: number;
    total_pages: number;
    links: [] | { next?: string; previous?: string };
  };
}

/** `page` da query → inteiro 1..10.000 (design §7). */
export function paginaDaQuery(valor: unknown): number {
  const n = Number(valor ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/**
 * Link de página como o paginador do Laravel: mantém os demais parâmetros da query NA ORDEM em que vieram e troca
 * o `page` no lugar dele (ou acrescenta no fim, se não veio). Ex.: `?orderBy=id&sortedBy=desc&page=2`.
 */
export function urlDaPagina(urlBase: string, query: Record<string, unknown>, pagina: number): string {
  const params = new URLSearchParams();
  let temPage = false;
  for (const [k, v] of Object.entries(query)) {
    if (k === 'page') {
      params.append('page', String(pagina));
      temPage = true;
    } else if (typeof v === 'string') params.append(k, v);
  }
  if (!temPage) params.append('page', String(pagina));
  return `${urlBase}?${params.toString()}`;
}

export function metaPaginacao(
  total: number,
  count: number,
  pagina: number,
  urlBase: string,
  query: Record<string, unknown> = {},
  porPagina = POR_PAGINA,
): MetaPaginacao {
  const totalPaginas = Math.ceil(total / porPagina);
  const links: { next?: string; previous?: string } = {};
  if (pagina > 1) links.previous = urlDaPagina(urlBase, query, pagina - 1);
  if (pagina < totalPaginas) links.next = urlDaPagina(urlBase, query, pagina + 1);
  return {
    pagination: {
      total,
      count,
      per_page: porPagina,
      current_page: pagina,
      total_pages: totalPaginas,
      // o Fractal serializa "sem links" como array vazio, não como objeto
      links: Object.keys(links).length ? links : [],
    },
  };
}
