import Stripe from 'stripe';
import type { Config } from '../../../shared/config/config';
import { EventoDePagamento, GatewayDePagamento, SessaoDeCheckout } from '../application/gateway-de-pagamento';
import type { AssinaturaDoProvedor } from '../domain/eventos';
import { lerEventoDoStripe, traduzirAssinatura } from './eventos-do-stripe';

/** Status no Stripe que impedem um novo checkout (a assinatura existe e ainda cobra ou pode voltar a cobrar). */
const IMPEDEM_NOVA = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

/** Adaptador real (ADR-011). SDK oficial com a versão da API fixada pelo próprio SDK (22.6.2 → 2026-08-26.dahlia). */
export class StripeGateway extends GatewayDePagamento {
  private readonly stripe: Stripe;
  /** Prefixo das chaves de idempotência por ambiente: dois ambientes na mesma conta Stripe não colidem (A07, S10). */
  private readonly ambiente: string;

  constructor(private readonly config: Config) {
    super();
    this.stripe = new Stripe(config.stripeSecretKey!);
    this.ambiente = new URL(config.siteUrl).host;
  }

  async criarCliente(d: { clienteId: number; nome: string; email: string }): Promise<string> {
    // chave de idempotência: dois pedidos simultâneos do mesmo cliente não criam dois cadastros no Stripe
    const c = await this.stripe.customers.create(
      { name: d.nome, email: d.email, metadata: { client_id: String(d.clienteId) } },
      { idempotencyKey: `sisfin-${this.ambiente}-cliente-${d.clienteId}` },
    );
    return c.id;
  }

  async criarCheckout(d: { clienteDoProvedor: string; clienteId: number; sucesso: string; cancelado: string }): Promise<SessaoDeCheckout> {
    const s = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: d.clienteDoProvedor,
      line_items: [{ price: this.config.stripePriceId!, quantity: 1 }],
      client_reference_id: String(d.clienteId),
      subscription_data: { metadata: { client_id: String(d.clienteId) } },
      success_url: d.sucesso,
      cancel_url: d.cancelado,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 h: a sessão aberta é reaproveitada até lá
    });
    return { id: s.id, url: s.url!, expiraEm: new Date(s.expires_at * 1000) };
  }

  async expirarCheckout(sessaoId: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(sessaoId);
    } catch (e) {
      // já expirada ou concluída: nada a fazer (concluída vira assinatura, que o temAssinaturaViva enxerga)
      if ((e as { type?: string }).type !== 'StripeInvalidRequestError') throw e;
    }
  }

  async temAssinaturaViva(clienteDoProvedor: string): Promise<boolean> {
    const lista = await this.stripe.subscriptions.list({ customer: clienteDoProvedor, status: 'all', limit: 20 });
    return lista.data.some((s) => IMPEDEM_NOVA.has(s.status));
  }

  async estadoAtual(sub: AssinaturaDoProvedor): Promise<AssinaturaDoProvedor> {
    return traduzirAssinatura(await this.stripe.subscriptions.retrieve(sub.id));
  }

  async criarPortal(d: { clienteDoProvedor: string; retorno: string }): Promise<string> {
    return (await this.stripe.billingPortal.sessions.create({ customer: d.clienteDoProvedor, return_url: d.retorno })).url;
  }

  lerEvento(corpoCru: Buffer, assinatura: string | undefined): EventoDePagamento {
    return lerEventoDoStripe(this.stripe, corpoCru, assinatura, this.config.stripeWebhookSecret);
  }
}
