import Stripe from 'stripe';
import { AssinaturaDoEventoInvalida, EventoDePagamento } from '../application/gateway-de-pagamento';
import type { AssinaturaDoProvedor } from '../domain/eventos';

// Verificação e tradução dos eventos no formato do Stripe — usadas pelos DOIS adaptadores (o simulador também exige
// assinatura: o E2E assina os eventos com o segredo local, como o Stripe CLI faria).

const EVENTOS_DE_ASSINATURA = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);
const data = (segundos: number | null | undefined) => (segundos ? new Date(segundos * 1000) : null);

/** Na API fixada pelo SDK 22 (2026-08-26.dahlia), o fim do período fica nos ITENS da assinatura, não nela. */
function fimDoPeriodo(sub: Stripe.Subscription): Date | null {
  const fins = sub.items.data.map((i) => i.current_period_end).filter((s): s is number => typeof s === 'number');
  return fins.length ? data(Math.max(...fins)) : null;
}

export function traduzirAssinatura(sub: Stripe.Subscription): AssinaturaDoProvedor {
  return {
    id: sub.id,
    cliente: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    fimDoPeriodo: fimDoPeriodo(sub),
    cancelarNoFim: sub.cancel_at_period_end,
    canceladaEm: data(sub.canceled_at),
  };
}

export function lerEventoDoStripe(stripe: Stripe, corpoCru: Buffer, cabecalho: string | undefined, segredo: string): EventoDePagamento {
  if (!cabecalho) throw new AssinaturaDoEventoInvalida('sem Stripe-Signature');
  let evento: Stripe.Event;
  try {
    evento = stripe.webhooks.constructEvent(corpoCru, cabecalho, segredo); // tolerância padrão: 5 min (replay)
  } catch (e) {
    throw new AssinaturaDoEventoInvalida((e as Error).message);
  }
  const base = { id: evento.id, tipo: evento.type, criadoEm: new Date(evento.created * 1000) };
  if (!EVENTOS_DE_ASSINATURA.has(evento.type)) return { ...base, assinatura: null };
  return { ...base, assinatura: traduzirAssinatura(evento.data.object as Stripe.Subscription) };
}
