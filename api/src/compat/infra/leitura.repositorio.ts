import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_TENANT, PrismaTenant } from '../../shared/tenant/prisma-tenant';

export type Sentido = 'asc' | 'desc';
export const ORDEM_CONTA_BANCARIA = { id: 'id', name: 'name', agency: 'agency', account: 'account', balance: 'balance' } as const;
export const ORDEM_EXTRATO = { id: 'id', value: 'value', balance: 'balance', bank_account_id: 'bankAccountId' } as const;

export interface Pagina {
  pagina: number;
  limite: number;
}

/** Leituras de outros módulos que o `contas`, a paridade e o SPA usam. Tudo via cliente COM tenant (design §4). */
@Injectable()
export class LeituraRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  /** `search` como o legado: LIKE %texto% (sem diferenciar maiúsculas) em nome, agência, conta e nome do banco. */
  async contasBancarias(
    { pagina, limite }: Pagina,
    ordem: { campo: keyof typeof ORDEM_CONTA_BANCARIA; sentido: Sentido },
    busca: string,
    comBanco: boolean,
  ) {
    const contem = (campo: string) => ({ [campo]: { contains: busca, mode: 'insensitive' as const } });
    const where = busca
      ? { OR: [contem('name'), contem('agency'), contem('account'), { bank: contem('name') }] }
      : undefined;
    const [total, itens] = await Promise.all([
      this.db.bankAccount.count({ where }),
      this.db.bankAccount.findMany({
        where,
        include: { bank: comBanco },
        orderBy: [{ [ORDEM_CONTA_BANCARIA[ordem.campo]]: ordem.sentido }, { id: 'asc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);
    return { total, itens };
  }

  contaBancaria(id: number) {
    return this.db.bankAccount.findUnique({ where: { id } });
  }

  listaContasBancarias() {
    return this.db.bankAccount.findMany({ select: { id: true, name: true, account: true }, orderBy: { id: 'asc' } });
  }

  categorias(tipo: 'despesa' | 'receita') {
    const args = { orderBy: { lft: 'asc' as const } };
    return tipo === 'despesa' ? this.db.categoryExpense.findMany(args) : this.db.categoryRevenue.findMany(args);
  }

  /** `search` é IGNORADO de propósito: o legado não declara campos pesquisáveis no extrato (trafego-spa.md). */
  async extrato({ pagina, limite }: Pagina, ordem: { campo: keyof typeof ORDEM_EXTRATO; sentido: Sentido }, comConta: boolean) {
    const [total, itens, porTipo] = await Promise.all([
      this.db.statement.count(),
      this.db.statement.findMany({
        include: { bankAccount: comConta },
        orderBy: [{ [ORDEM_EXTRATO[ordem.campo]]: ordem.sentido }, { id: 'asc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      this.db.statement.groupBy({ by: ['statementableType'], _count: { _all: true }, _sum: { value: true } }),
    ]);
    return { total, itens, porTipo };
  }
}
