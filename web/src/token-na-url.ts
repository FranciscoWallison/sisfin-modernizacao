// REQ-SIT-06 / DUV-SIT-003: o app antigo (que não editamos) abre `/my-financial?token=<JWT>`. O parâmetro NUNCA é
// lido: é apagado da barra de endereço antes de qualquer outra coisa (o token já está no localStorage — mesma origem).

/** URL sem o parâmetro `token` (preserva caminho, outros parâmetros e hash); null se não havia token. */
export function semToken(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has('token')) return null;
  url.searchParams.delete('token');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Aplica no navegador: troca a entrada do histórico (não cria outra) pela URL sem o token. */
export function removerTokenDaUrl(janela: Pick<Window, 'location' | 'history'> = window): boolean {
  const limpa = semToken(janela.location.href);
  if (limpa === null) return false;
  janela.history.replaceState(janela.history.state, '', limpa);
  return true;
}
