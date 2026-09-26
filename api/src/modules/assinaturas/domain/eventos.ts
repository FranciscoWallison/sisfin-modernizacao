// Evento do provedor → estado local da assinatura (REQ-ASS-03). Função pura.
// O objeto que vem no evento (assinado) é a fonte do estado; o Stripe não garante a ORDEM nem a entrega ÚNICA:
// - a repetição é barrada antes, pelo id do evento (tabela webhook_events);
// - aqui, evento mais antigo que o último aplicado é ignorado, e uma assinatura encerrada não "revive".
import { STATUS_ENCERRADOS } from './assinatura';

/** A assinatura como o provedor a descreve (já traduzida do formato do Stripe pela infra). */
export interface AssinaturaDoProvedor {
  id: string;
  cliente: string;
  status: string;
  fimDoPeriodo: Date | null;
  cancelarNoFim: boolean;
  canceladaEm: Date | null;
}

export interface EstadoLocal {
  status: string;
  fimDoPeriodo: Date | null;
  cancelarNoFim: boolean;
  canceladaEm: Date | null;
  ultimoEventoEm: Date | null;
}

/** Novo estado, ou null quando o evento deve ser ignorado. */
export function decidirEstado(atual: EstadoLocal | null, sub: AssinaturaDoProvedor, eventoEm: Date): EstadoLocal | null {
  if (atual?.ultimoEventoEm && eventoEm < atual.ultimoEventoEm) return null; // chegou atrasado
  // Mesmo segundo (o `created` do evento só tem segundos): o `created` com `incomplete` e o `updated` com `active` do
  // fechamento do Checkout saem juntos — `incomplete` nunca desfaz um estado posterior (revisão A07, S2)
  if (atual?.ultimoEventoEm && eventoEm.getTime() === atual.ultimoEventoEm.getTime() && sub.status === 'incomplete' && atual.status !== 'incomplete') {
    return null;
  }
  if (atual && STATUS_ENCERRADOS.has(atual.status) && !STATUS_ENCERRADOS.has(sub.status)) return null; // não revive
  return {
    status: sub.status,
    fimDoPeriodo: sub.fimDoPeriodo,
    cancelarNoFim: sub.cancelarNoFim,
    canceladaEm: sub.canceladaEm,
    ultimoEventoEm: eventoEm,
  };
}
