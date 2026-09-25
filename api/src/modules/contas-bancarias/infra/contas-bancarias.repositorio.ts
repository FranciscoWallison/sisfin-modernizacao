import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHAVES_ADVISORY_LOCK } from '../../../shared/prisma/chaves-lock';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';

// Acesso a dados de contas bancárias e bancos (design §2). BankAccount tem tenant (extensão); Bank é global.
// SQL cru (locks) só aqui, com clientId explícito no WHERE (lint da T02).

export interface DadosContaBancaria {
  name: string;
  agency: string;
  account: string;
  bankId: number;
  default: boolean;
}

export type Tx = Prisma.TransactionClient;
const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o Laravel
const CHAVE_LOCK_PADRAO = CHAVES_ADVISORY_LOCK.contaPadrao; // registro único das chaves (S8)

/** Espera máxima por lock (S2): um cliente com muitas escritas simultâneas não prende conexões do pool sem fim — após
 * 3 s o Postgres desiste (55P03) e a resposta é 409 (o cliente pode repetir). SET LOCAL: só nesta transação. */
const LIMITAR_ESPERA_DE_LOCK = Prisma.sql`SET LOCAL lock_timeout = '3s'`;

/** Operações dentro de UMA transação. Criado só por ContasBancariasRepositorio.transacao(). */
export class ContasBancariasTransacao {
  constructor(private readonly tx: Tx) {}

  /**
   * Trava, em ordem de id, a conta `id` (se vier) e as contas padrão do cliente — mesma ordem que o módulo `contas`
   * usa ao lançar pagamentos (evita deadlock). Devolve os ids travados.
   */
  async travar(clientId: number, id: number | null, incluirPadrao: boolean): Promise<number[]> {
    const linhas = await this.tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "bank_accounts"
      WHERE client_id = ${clientId} AND (id = ${id ?? -1} OR (${incluirPadrao} AND "default"))
      ORDER BY id FOR UPDATE`;
    return linhas.map((l) => l.id);
  }

  /** Serializa as trocas de conta padrão DO CLIENTE (também quando ele ainda não tem nenhuma — não há linha a travar). */
  async travarTrocaDePadrao(clientId: number): Promise<void> {
    await this.tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${CHAVE_LOCK_PADRAO}::int, ${clientId}::int)`;
  }

  async bancoExiste(id: number): Promise<boolean> {
    return (await this.tx.bank.count({ where: { id } })) > 0;
  }

  /** Desmarca a(s) padrão do cliente, exceto `exceto` (REQ-CBA-02). O filtro de cliente vem da extensão de tenant. */
  desmarcarPadrao(exceto: number | null) {
    return this.tx.bankAccount.updateMany({
      where: { default: true, ...(exceto !== null ? { id: { not: exceto } } : {}) },
      data: { default: false, updatedAt: agora() },
    });
  }

  /** balance nunca vem de fora (REQ-CBA-03): conta nova nasce com 0 (default do schema). */
  criar(d: DadosContaBancaria) {
    const t = agora();
    return this.tx.bankAccount.create({ data: { ...d, createdAt: t, updatedAt: t } as never });
  }

  atualizar(id: number, d: DadosContaBancaria) {
    return this.tx.bankAccount.update({ where: { id }, data: { ...d, updatedAt: agora() } });
  }

  /** Contas a pagar/receber ou extrato ligados à conta bancária (REQ-CBA-05). */
  async temLancamentos(id: number): Promise<boolean> {
    const where = { bankAccountId: id };
    const [pagar, receber, extrato] = await Promise.all([
      this.tx.billPay.count({ where }), this.tx.billReceive.count({ where }), this.tx.statement.count({ where }),
    ]);
    return pagar + receber + extrato > 0;
  }

  excluir(id: number) {
    return this.tx.bankAccount.delete({ where: { id } });
  }
}

@Injectable()
export class ContasBancariasRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  transacao<T>(fn: (t: ContasBancariasTransacao) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(LIMITAR_ESPERA_DE_LOCK);
      return fn(new ContasBancariasTransacao(tx as unknown as Tx));
    });
  }

  /** Lista GLOBAL de bancos, em ordem de id (RN-CBA-007) — Bank não tem cliente. */
  bancos() {
    return this.db.bank.findMany({ orderBy: { id: 'asc' } });
  }
}
