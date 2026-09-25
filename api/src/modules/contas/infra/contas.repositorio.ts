import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';
import type { TipoConta } from '../domain/movimentos';

// Acesso a dados do módulo contas. TODO acesso passa pelo cliente COM tenant; o SQL cru (FOR UPDATE) recebe
// clientId explícito e o usa no WHERE (lint da T02 / revisão de segurança #2).

const TABELA = { pagar: Prisma.raw('"bill_pays"'), receber: Prisma.raw('"bill_receives"') } as const; // constantes, nunca entrada
export const TIPO_EXTRATO = { pagar: 'BillPay', receber: 'BillReceive' } as const;

export interface ContaTravada {
  id: number;
  valor: string; // decimal em texto
  paga: boolean;
  contaBancaria: number;
}

export interface DadosConta {
  name: string;
  dateDue: string; // aaaa-mm-dd
  value: string; // decimal em texto
  done: boolean;
  categoryId: number;
  bankAccountId: number;
}

export type Tx = Prisma.TransactionClient;
const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o Laravel

/** Operações dentro de UMA transação (design §5). Criado só por ContasRepositorio.transacao(). */
export class ContasTransacao {
  constructor(private readonly tx: Tx) {}

  private modelo(tipo: TipoConta) {
    return tipo === 'pagar' ? this.tx.billPay : (this.tx.billReceive as unknown as Tx['billPay']);
  }

  /** Passo 1 do design §5: trava a linha da conta e lê o estado "antes" sob lock. */
  async travarConta(tipo: TipoConta, id: number, clientId: number): Promise<ContaTravada | null> {
    const linhas = await this.tx.$queryRaw<{ id: number; value: string; done: boolean; bank_account_id: number }[]>`
      SELECT id, value::text AS value, done, bank_account_id FROM ${TABELA[tipo]}
      WHERE id = ${id} AND client_id = ${clientId} FOR UPDATE`;
    const l = linhas[0];
    return l ? { id: l.id, valor: l.value, paga: l.done, contaBancaria: l.bank_account_id } : null;
  }

  /** Passo 4: trava as contas bancárias em ordem crescente de id (evita deadlock) e devolve os saldos. */
  async travarContasBancarias(ids: number[], clientId: number): Promise<Map<number, string>> {
    const ordenados = [...new Set(ids)].sort((a, b) => a - b);
    const linhas = await this.tx.$queryRaw<{ id: number; balance: string }[]>`
      SELECT id, balance::text AS balance FROM "bank_accounts"
      WHERE id IN (${Prisma.join(ordenados)}) AND client_id = ${clientId} ORDER BY id FOR UPDATE`;
    return new Map(linhas.map((l) => [l.id, l.balance]));
  }

  async categoriaExiste(tipo: TipoConta, id: number): Promise<boolean> {
    const n = tipo === 'pagar'
      ? await this.tx.categoryExpense.count({ where: { id } })
      : await this.tx.categoryRevenue.count({ where: { id } });
    return n > 0;
  }

  async contaBancariaExiste(id: number): Promise<boolean> {
    return (await this.tx.bankAccount.count({ where: { id } })) > 0;
  }

  criarConta(tipo: TipoConta, d: DadosConta) {
    const t = agora();
    return this.modelo(tipo).create({
      data: { ...d, dateDue: new Date(`${d.dateDue}T00:00:00Z`), createdAt: t, updatedAt: t } as never,
    });
  }

  atualizarConta(tipo: TipoConta, id: number, d: DadosConta) {
    return this.modelo(tipo).update({
      where: { id },
      data: { ...d, dateDue: new Date(`${d.dateDue}T00:00:00Z`), updatedAt: agora() },
    });
  }

  excluirConta(tipo: TipoConta, id: number) {
    return this.modelo(tipo).delete({ where: { id } });
  }

  atualizarSaldo(contaBancaria: number, saldo: string) {
    return this.tx.bankAccount.update({ where: { id: contaBancaria }, data: { balance: saldo, updatedAt: agora() } });
  }

  registrarExtrato(e: {
    tipo: TipoConta; contaId: number; contaBancaria: number; valor: string; saldo: string;
    kind: string; usuarioId: number; acao: string;
  }) {
    const t = agora();
    return this.tx.statement.create({
      data: {
        value: e.valor, balance: e.saldo, bankAccountId: e.contaBancaria, statementableId: e.contaId,
        statementableType: TIPO_EXTRATO[e.tipo], kind: e.kind, userId: e.usuarioId, action: e.acao,
        createdAt: t, updatedAt: t,
      } as never,
    });
  }
}

export interface FiltroLista {
  texto?: string;
  periodo?: { inicio: string; fim: string };
  valor?: string;
}

@Injectable()
export class ContasRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  transacao<T>(fn: (t: ContasTransacao) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => fn(new ContasTransacao(tx as unknown as Tx)));
  }

  private modelo(tipo: TipoConta) {
    return tipo === 'pagar' ? this.db.billPay : (this.db.billReceive as unknown as PrismaTenant['billPay']);
  }

  private include(incluirCategoria: boolean, incluirConta: boolean) {
    return { category: incluirCategoria, bankAccount: incluirConta };
  }

  obter(tipo: TipoConta, id: number, incluirCategoria = false, incluirConta = false) {
    return this.modelo(tipo).findUnique({ where: { id }, include: this.include(incluirCategoria, incluirConta) });
  }

  /** where da listagem (REQ-CON-11): OU entre texto no nome (curingas escapados pelo Prisma), período e valor. */
  private where(filtro: FiltroLista | null): Prisma.BillPayWhereInput | undefined {
    if (!filtro) return undefined;
    const ou: Prisma.BillPayWhereInput[] = [];
    if (filtro.texto) ou.push({ name: { contains: filtro.texto, mode: 'insensitive' } });
    if (filtro.periodo) ou.push({ dateDue: { gte: new Date(`${filtro.periodo.inicio}T00:00:00Z`), lte: new Date(`${filtro.periodo.fim}T00:00:00Z`) } });
    if (filtro.valor) ou.push({ value: filtro.valor });
    return { OR: ou };
  }

  async listar(
    tipo: TipoConta, filtro: FiltroLista | null, pagina: number, limite: number,
    ordem: { campo: string; sentido: 'asc' | 'desc' }, incluirCategoria: boolean, incluirConta: boolean,
  ) {
    const where = this.where(filtro);
    const [total, itens] = await Promise.all([
      this.modelo(tipo).count({ where }),
      this.modelo(tipo).findMany({
        where, include: this.include(incluirCategoria, incluirConta),
        orderBy: [{ [ordem.campo]: ordem.sentido }, { id: 'asc' }], skip: (pagina - 1) * limite, take: limite,
      }),
    ]);
    return { total, itens };
  }

  /** Soma de value com o MESMO filtro da lista (REQ-CON-12) — o AND com done fica isolado (corrige RN-CON-018). */
  async somar(tipo: TipoConta, filtro: FiltroLista | null, extra: Prisma.BillPayWhereInput = {}): Promise<string> {
    const where = this.where(filtro);
    const r = await this.modelo(tipo).aggregate({ where: { AND: [where ?? {}, extra] }, _sum: { value: true } });
    return (r._sum.value ?? new Prisma.Decimal(0)).toFixed(2);
  }
}
