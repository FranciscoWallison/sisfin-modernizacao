import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHAVES_ADVISORY_LOCK } from '../../../shared/prisma/chaves-lock';
import { ContextoCliente } from '../../../shared/tenant/contexto-cliente';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';
import { STATUS_QUE_NAO_IMPEDEM_NOVA } from '../domain/assinatura';
import type { EstadoLocal } from '../domain/eventos';

// Assinaturas (design §1–2, ADR-011). Subscription tem tenant (extensão); Plan, Client e WebhookEvent não.
// SQL cru só para os advisory locks, com clientId explícito.

export type Tx = Prisma.TransactionClient;
const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o resto
const LIMITAR_ESPERA_DE_LOCK = Prisma.sql`SET LOCAL lock_timeout = '3s'`;
/** As que impedem uma nova (o mesmo critério do índice "uma viva por cliente"). */
const VIVAS = { status: { notIn: [...STATUS_QUE_NAO_IMPEDEM_NOVA] } };

/** Operações do checkout de UM cliente, dentro de uma transação que serializa os checkouts dele. */
export class CheckoutTransacao {
  constructor(
    private readonly tx: Tx,
    private readonly clientId: number,
  ) {}

  cliente() {
    return this.tx.client.findUniqueOrThrow({
      where: { id: this.clientId },
      select: { name: true, email: true, stripeCustomerId: true, checkoutSessionId: true, checkoutSessionUrl: true, checkoutSessionExpiresAt: true },
    });
  }

  async temAssinaturaViva(): Promise<boolean> {
    return (await this.tx.subscription.count({ where: VIVAS })) > 0; // filtro do cliente: extensão de tenant
  }

  gravarClienteDoProvedor(stripeCustomerId: string) {
    return this.tx.client.update({ where: { id: this.clientId }, data: { stripeCustomerId } });
  }

  gravarCheckout(sessao: { id: string; url: string; expiraEm: Date }) {
    return this.tx.client.update({
      where: { id: this.clientId },
      data: { checkoutSessionId: sessao.id, checkoutSessionUrl: sessao.url, checkoutSessionExpiresAt: sessao.expiraEm },
    });
  }
}

@Injectable()
export class AssinaturasRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  planos() {
    return this.db.plan.findMany({ orderBy: { id: 'asc' } });
  }

  /** Todas as assinaturas do cliente do contexto, com o plano (a vigente é escolhida no domínio). */
  assinaturas() {
    return this.db.subscription.findMany({ orderBy: { id: 'desc' }, include: { plan: true } });
  }

  clienteDoProvedor(clientId: number) {
    return this.db.client.findUnique({ where: { id: clientId }, select: { stripeCustomerId: true } });
  }

  clientePorProvedor(stripeCustomerId: string) {
    return this.db.client.findUnique({ where: { stripeCustomerId }, select: { id: true } });
  }

  /**
   * Um checkout por vez por cliente (advisory lock): dois pedidos simultâneos não abrem duas sessões. Timeout maior que
   * o padrão do Prisma (5 s): a transação espera a resposta do provedor.
   */
  transacaoDoCheckout<T>(clientId: number, fn: (t: CheckoutTransacao) => Promise<T>): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw(LIMITAR_ESPERA_DE_LOCK);
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${CHAVES_ADVISORY_LOCK.checkoutDoCliente}::int, ${clientId}::int)`;
        return fn(new CheckoutTransacao(tx as unknown as Tx, clientId));
      },
      { timeout: 20_000 },
    );
  }

  /**
   * Aplica um evento do webhook ao cliente `clientId`, numa transação: eventos da MESMA assinatura em série (advisory
   * lock — sem ele, `created` e `updated` simultâneos do fechamento do Checkout liam o mesmo estado e o mais antigo
   * gravava por último: revisão A07, S1), registro do id do evento (repetido → nada muda) e o estado decidido pelo
   * domínio. Roda no contexto do cliente (a extensão de tenant filtra por ele).
   */
  aplicarEvento(
    clientId: number,
    evento: { id: string; tipo: string; assinatura: string; planoId: number | null },
    decidir: (atual: EstadoLocal | null) => EstadoLocal | null,
  ): Promise<'aplicado' | 'repetido' | 'ignorado'> {
    return ContextoCliente.executarAsync({ clienteId: clientId, usuarioId: 0 }, () =>
      this.db.$transaction(async (tx) => {
        await tx.$executeRaw(LIMITAR_ESPERA_DE_LOCK);
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${CHAVES_ADVISORY_LOCK.eventoDaAssinatura}::int, hashtext(${evento.assinatura}))`;
        const novoEvento = await tx.webhookEvent.createMany({
          data: [{ id: evento.id, type: evento.tipo, receivedAt: agora() }],
          skipDuplicates: true,
        });
        if (novoEvento.count === 0) return 'repetido' as const;
        const atual = await tx.subscription.findUnique({ where: { providerSubscriptionId: evento.assinatura } });
        const novo = decidir(
          atual && {
            status: atual.status,
            fimDoPeriodo: atual.currentPeriodEnd,
            cancelarNoFim: atual.cancelAtPeriodEnd,
            canceladaEm: atual.canceledAt,
            ultimoEventoEm: atual.lastEventAt,
          },
        );
        if (!novo) return 'ignorado' as const;
        const dados = {
          status: novo.status,
          currentPeriodEnd: novo.fimDoPeriodo,
          cancelAtPeriodEnd: novo.cancelarNoFim,
          canceledAt: novo.canceladaEm,
          lastEventAt: novo.ultimoEventoEm,
          updatedAt: agora(),
        };
        await tx.subscription.upsert({
          where: { providerSubscriptionId: evento.assinatura },
          create: { ...dados, providerSubscriptionId: evento.assinatura, planId: evento.planoId, createdAt: agora() } as never,
          update: dados,
        });
        // assinatura que impede outra: a sessão de checkout guardada não serve mais
        if (!STATUS_QUE_NAO_IMPEDEM_NOVA.has(novo.status)) {
          await tx.client.update({ where: { id: clientId }, data: { checkoutSessionId: null, checkoutSessionUrl: null, checkoutSessionExpiresAt: null } });
        }
        return 'aplicado' as const;
      }),
    );
  }
}
