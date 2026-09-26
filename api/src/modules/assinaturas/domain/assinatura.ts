// Gate de assinatura (REQ-ASS-05): a regra do CheckSubscription do legado (RN-ASS-006) sobre o estado do Stripe.
// Função pura.
//
// Legado: sem assinatura → 400; sem expires_at, inativa, cancelada (canceled_at) ou vencida → 403.
// Diferenças deliberadas:
// - decide pelo STATUS, não pelo canceled_at: no Stripe, "cancelar no fim do período" preenche o canceled_at na hora do
//   pedido, com a assinatura ainda `active` — copiar a regra cortaria o período já pago;
// - tolerância de 2 dias depois do fim do período para quem está liberado: a renovação chega por webhook, e um atraso
//   (reenvio do Stripe) não pode bloquear quem já pagou (revisão A07, S7). Falha de cobrança vira `past_due`, que
//   bloqueia na hora.

export type Acesso = 'liberado' | 'sem_assinatura' | 'expirada';

/** Só estes status liberam o app. `past_due`/`unpaid`/`incomplete` bloqueiam, como "inativa" no legado. */
export const STATUS_QUE_LIBERAM: ReadonlySet<string> = new Set(['active', 'trialing']);
/** Status finais no Stripe: a assinatura não volta. */
export const STATUS_ENCERRADOS: ReadonlySet<string> = new Set(['canceled', 'incomplete_expired']);
/**
 * Status que NÃO impedem uma nova assinatura (e ficam fora do índice "uma viva por cliente"): os encerrados e
 * `incomplete` — um 3DS abandonado não pode travar o cliente por 23 h (revisão A07, S8).
 */
export const STATUS_QUE_NAO_IMPEDEM_NOVA: ReadonlySet<string> = new Set([...STATUS_ENCERRADOS, 'incomplete']);

export const TOLERANCIA_APOS_O_PERIODO_MS = 2 * 24 * 60 * 60 * 1000;

export interface EstadoParaAcesso {
  status: string;
  fimDoPeriodo: Date | null;
}

export function acessoPelaAssinatura(a: EstadoParaAcesso | null, agora: Date): Acesso {
  if (!a) return 'sem_assinatura';
  if (!STATUS_QUE_LIBERAM.has(a.status) || !a.fimDoPeriodo) return 'expirada';
  return a.fimDoPeriodo.getTime() + TOLERANCIA_APOS_O_PERIODO_MS < agora.getTime() ? 'expirada' : 'liberado';
}

/**
 * Qual assinatura do cliente vale (tela e gate)? A que libera (maior fim de período); senão a viva mais recente; senão
 * a mais recente. Olhar só a última linha deixava uma tentativa expirada esconder a assinatura paga (revisão A07, S3).
 */
export function escolherVigente<T extends { id: number; status: string; fimDoPeriodo: Date | null }>(lista: T[]): T | null {
  const porId = [...lista].sort((a, b) => b.id - a.id);
  const liberam = porId
    .filter((s) => STATUS_QUE_LIBERAM.has(s.status))
    .sort((a, b) => (b.fimDoPeriodo?.getTime() ?? 0) - (a.fimDoPeriodo?.getTime() ?? 0));
  return liberam[0] ?? porId.find((s) => !STATUS_QUE_NAO_IMPEDEM_NOVA.has(s.status)) ?? porId[0] ?? null;
}
