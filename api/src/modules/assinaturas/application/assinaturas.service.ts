import { Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CONFIG } from '../../../shared/auth-compat/contexto';
import type { Config } from '../../../shared/config/config';
import { VerificadorDeAssinatura } from '../../../shared/tenant/assinatura.guard';
import { ContextoCliente } from '../../../shared/tenant/contexto-cliente';
import { acessoPelaAssinatura, escolherVigente } from '../domain/assinatura';
import { decidirEstado } from '../domain/eventos';
import { AssinaturasRepositorio } from '../infra/assinaturas.repositorio';
import { GatewayDePagamento } from './gateway-de-pagamento';

// Assinaturas (design §2, ADR-011). O ESTADO só muda pelo webhook (assinado); o checkout só abre a sessão.

const JA_ASSINA = () => new UnprocessableEntityException({ message: 'Client already has an active subscription.' });
/** Sessão guardada ainda serve se tiver pelo menos este tempo de vida: o cliente precisa de tempo para pagar. */
const FOLGA_DA_SESSAO_MS = 10 * 60 * 1000;
/** P2002 do índice parcial "uma viva por cliente" (e não de outra chave única). */
const ehSegundaViva = (e: unknown) => {
  const erro = e as { code?: unknown; meta?: unknown };
  return erro?.code === 'P2002' && /uma_viva|client_id/.test(JSON.stringify(erro.meta ?? {}));
};

@Injectable()
export class AssinaturasService extends VerificadorDeAssinatura {
  private readonly log = new Logger('Assinaturas');

  constructor(
    private readonly repo: AssinaturasRepositorio,
    private readonly gateway: GatewayDePagamento,
    @Inject(CONFIG) private readonly config: Config,
  ) {
    super();
  }

  planos() {
    return this.repo.planos();
  }

  /** A assinatura que vale para o cliente do contexto (escolherVigente); 404 se nunca assinou. */
  async estado() {
    const a = await this.vigente();
    if (!a) throw new NotFoundException();
    return a;
  }

  private async vigente() {
    return escolherVigente((await this.repo.assinaturas()).map((s) => ({ ...s, fimDoPeriodo: s.currentPeriodEnd })));
  }

  /**
   * Abre (ou reaproveita) a sessão de pagamento — REQ-ASS-02. Serializado por cliente: dois pedidos simultâneos não
   * abrem duas sessões; quem já tem assinatura viva recebe 422 (o legado deixava assinar duas vezes).
   */
  checkout(clienteId: number): Promise<string> {
    return this.repo.transacaoDoCheckout(clienteId, async (t) => {
      if (await t.temAssinaturaViva()) throw JA_ASSINA();
      const c = await t.cliente();
      // O banco local só sabe o que o webhook contou: se ele atrasou ou se perdeu, o PROVEDOR ainda sabe (A07, S4)
      if (c.stripeCustomerId && (await this.gateway.temAssinaturaViva(c.stripeCustomerId))) throw JA_ASSINA();
      if (c.checkoutSessionUrl && c.checkoutSessionExpiresAt && c.checkoutSessionExpiresAt.getTime() - Date.now() > FOLGA_DA_SESSAO_MS) {
        return c.checkoutSessionUrl;
      }
      // Sessão guardada perto de vencer: EXPIRA antes de abrir outra — duas abas pagáveis = cobrança dupla (A07, S4)
      if (c.checkoutSessionId) await this.gateway.expirarCheckout(c.checkoutSessionId);
      let clienteDoProvedor = c.stripeCustomerId;
      if (!clienteDoProvedor) {
        clienteDoProvedor = await this.gateway.criarCliente({ clienteId, nome: c.name, email: c.email });
        await t.gravarClienteDoProvedor(clienteDoProvedor);
      }
      const sessao = await this.gateway.criarCheckout({
        clienteDoProvedor,
        clienteId,
        sucesso: `${this.config.siteUrl}/subscriptions/successfully`,
        cancelado: `${this.config.siteUrl}/subscriptions/create`,
      });
      await t.gravarCheckout(sessao);
      return sessao.url;
    });
  }

  /** Portal do cliente (cancelar, trocar cartão, faturas) — REQ-ASS-04. */
  async portal(clienteId: number): Promise<string> {
    const c = await this.repo.clienteDoProvedor(clienteId);
    if (!c?.stripeCustomerId) throw new NotFoundException();
    return this.gateway.criarPortal({ clienteDoProvedor: c.stripeCustomerId, retorno: `${this.config.siteUrl}/my-financial` });
  }

  /**
   * Webhook (REQ-ASS-03): verifica a assinatura (lança AssinaturaDoEventoInvalida) e aplica. Evento que não muda
   * assinatura, cliente desconhecido, repetido ou fora de ordem → nada muda, e o provedor recebe 200 (não reenvia).
   */
  async receberEvento(corpoCru: Buffer, assinatura: string | undefined): Promise<void> {
    const evento = this.gateway.lerEvento(corpoCru, assinatura);
    const sub = evento.assinatura;
    if (!sub) return;
    const cliente = await this.repo.clientePorProvedor(sub.cliente);
    if (!cliente) {
      this.log.warn(`evento ${evento.id} (${evento.tipo}) de um cliente do provedor desconhecido — ignorado`);
      return;
    }
    // O estado ATUAL no provedor, não o do evento (o que o Stripe recomenda): a ordem de chegada deixa de importar
    // (A07, S1). No simulador, o próprio evento.
    const atualNoProvedor = await this.gateway.estadoAtual(sub);
    const planoId = (await this.repo.planos())[0]?.id ?? null; // plano único (RN-ASS-001)
    try {
      const r = await this.repo.aplicarEvento(
        cliente.id,
        { id: evento.id, tipo: evento.tipo, assinatura: sub.id, planoId },
        (atual) => decidirEstado(atual, atualNoProvedor, evento.criadoEm),
      );
      if (r !== 'aplicado') this.log.log(`evento ${evento.id} (${evento.tipo}): ${r}`);
    } catch (e) {
      // Segunda assinatura viva do mesmo cliente (índice único parcial): não deveria acontecer (checkout serializado
      // e reaproveitado), mas se acontecer é dinheiro cobrado — erro no log para ação manual, e 200 para o provedor
      // não reenviar sem fim.
      // Só o índice "uma viva por cliente"; qualquer outra violação (ex.: id da assinatura já de outro cliente) → 500,
      // e o provedor reenvia (o evento não foi registrado: a transação voltou)
      if (ehSegundaViva(e)) {
        this.log.error(`evento ${evento.id}: cliente ${cliente.id} já tem assinatura viva; ${sub.id} NÃO registrada — verificar cobrança`);
        return;
      }
      throw e;
    }
  }

  /** O gate (VerificadorDeAssinatura): a regra do legado sobre a assinatura VIGENTE (não a última linha — A07, S3). */
  async acesso(clienteId: number) {
    const a = await ContextoCliente.executarAsync({ clienteId, usuarioId: 0 }, () => this.vigente());
    return acessoPelaAssinatura(a, new Date());
  }
}
