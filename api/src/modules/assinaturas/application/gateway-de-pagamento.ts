import type { AssinaturaDoProvedor } from '../domain/eventos';

// A PORTA do provedor de pagamento (ADR-011). Dois adaptadores em infra/: o Stripe e o simulador (testes, CI e E2E,
// sem rede nem chave). Trocar de provedor = um adaptador novo.

/** Evento do webhook já VERIFICADO (assinatura) e traduzido; `assinatura` só nos eventos que mudam o estado. */
export interface EventoDePagamento {
  id: string;
  tipo: string;
  criadoEm: Date;
  assinatura: AssinaturaDoProvedor | null;
}

export interface SessaoDeCheckout {
  id: string;
  url: string;
  expiraEm: Date;
}

/** Assinatura do webhook ausente, inválida ou vencida: o evento não é confiável (REQ-ASS-03). */
export class AssinaturaDoEventoInvalida extends Error {}

export abstract class GatewayDePagamento {
  /** Cria o cliente no provedor e devolve o id dele. */
  abstract criarCliente(d: { clienteId: number; nome: string; email: string }): Promise<string>;
  abstract criarCheckout(d: { clienteDoProvedor: string; clienteId: number; sucesso: string; cancelado: string }): Promise<SessaoDeCheckout>;
  /** Expira uma sessão de checkout ainda aberta (antes de abrir outra: duas abas pagáveis = cobrança dupla). */
  abstract expirarCheckout(sessaoId: string): Promise<void>;
  /** O PROVEDOR já tem assinatura que impede outra? (cobre o webhook atrasado ou perdido — o banco local não sabe) */
  abstract temAssinaturaViva(clienteDoProvedor: string): Promise<boolean>;
  /** Estado ATUAL da assinatura no provedor (o Stripe recomenda: a ordem dos eventos deixa de importar). */
  abstract estadoAtual(sub: AssinaturaDoProvedor): Promise<AssinaturaDoProvedor>;
  /** Portal do cliente: cancelar, trocar cartão, faturas (DUV-ASS-006). */
  abstract criarPortal(d: { clienteDoProvedor: string; retorno: string }): Promise<string>;
  /** Verifica a assinatura sobre o corpo CRU e traduz. Lança AssinaturaDoEventoInvalida. */
  abstract lerEvento(corpoCru: Buffer, assinatura: string | undefined): EventoDePagamento;
}
