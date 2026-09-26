import Stripe from 'stripe';
import type { Config } from '../../../shared/config/config';
import { EventoDePagamento, GatewayDePagamento, SessaoDeCheckout } from '../application/gateway-de-pagamento';
import type { AssinaturaDoProvedor } from '../domain/eventos';
import { lerEventoDoStripe } from './eventos-do-stripe';

/**
 * Simulador do provedor (ADR-011): sem rede nem chave, para testes, CI e E2E. Ids DETERMINÍSTICOS (o teste sabe qual
 * cliente do provedor assinar no evento); o "checkout" volta direto para a tela de sucesso da própria origem, e o
 * pagamento chega como no Stripe de verdade: um evento ASSINADO no webhook.
 */
export class SimuladorGateway extends GatewayDePagamento {
  // O SDK só é usado para verificar a assinatura dos eventos (nenhuma chamada de rede com esta chave)
  private readonly stripe = new Stripe('sk_test_simulador_sem_rede');

  constructor(private readonly config: Config) {
    super();
  }

  async criarCliente(d: { clienteId: number }): Promise<string> {
    return `cus_sim_${d.clienteId}`;
  }

  async criarCheckout(): Promise<SessaoDeCheckout> {
    return {
      id: `cs_sim_${Date.now().toString(36)}`,
      url: `${this.config.siteUrl}/subscriptions/successfully?simulador=1`,
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    };
  }

  async expirarCheckout(): Promise<void> {}

  /** O simulador não guarda nada: o estado local (dos eventos) é a única fonte. */
  async temAssinaturaViva(): Promise<boolean> {
    return false;
  }

  async estadoAtual(sub: AssinaturaDoProvedor): Promise<AssinaturaDoProvedor> {
    return sub;
  }

  async criarPortal(): Promise<string> {
    return `${this.config.siteUrl}/my-financial?portal=simulador`;
  }

  lerEvento(corpoCru: Buffer, assinatura: string | undefined): EventoDePagamento {
    return lerEventoDoStripe(this.stripe, corpoCru, assinatura, this.config.stripeWebhookSecret);
  }
}
