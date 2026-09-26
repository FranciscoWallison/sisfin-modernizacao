// Assinatura (ADR-011): regras puras da tela — para onde a API manda o navegador e como mostrar o estado.

/** Origens para onde a tela aceita ir: o Checkout e o portal do Stripe. O simulador devolve a própria origem. */
const DESTINOS_DO_STRIPE = ['https://checkout.stripe.com', 'https://billing.stripe.com'];

/**
 * A URL que a API devolveu pode ser seguida? Só https do Stripe ou a própria origem (simulador). Qualquer outra coisa
 * (outra origem, `javascript:`, texto) é recusada: a tela não vira um redirecionador aberto.
 */
export function destinoSeguro(url: unknown, origemDoSite: string): string | null {
  if (typeof url !== 'string') return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  return DESTINOS_DO_STRIPE.includes(u.origin) || u.origin === origemDoSite ? u.href : null;
}

const STATUS: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Em período de teste',
  past_due: 'Pagamento em atraso',
  unpaid: 'Não paga',
  incomplete: 'Aguardando pagamento',
  incomplete_expired: 'Expirada',
  canceled: 'Cancelada',
  paused: 'Pausada',
};

export const nomeDoStatus = (status: string): string => STATUS[status] ?? status;
/** Os mesmos status que liberam o app na API (domain/assinatura.ts). */
export const estaAtiva = (status: string): boolean => status === 'active' || status === 'trialing';
export const reais = (valor: number): string => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface Assinatura {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan: { name: string; value: number } | null;
}

export interface Plano {
  id: number;
  name: string;
  description: string;
  value: number;
}
