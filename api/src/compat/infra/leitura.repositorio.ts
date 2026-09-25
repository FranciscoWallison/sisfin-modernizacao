import { Inject, Injectable } from '@nestjs/common';
import { POR_PAGINA } from '../../shared/http/paginacao';
import { PRISMA_TENANT, PrismaTenant } from '../../shared/tenant/prisma-tenant';

export type Ordem = { campo: 'id' | 'value' | 'balance' | 'bank_account_id'; sentido: 'asc' | 'desc' };
const CAMPO_PRISMA = { id: 'id', value: 'value', balance: 'balance', bank_account_id: 'bankAccountId' } as const;

/** Leituras de outros módulos que o `contas` e a paridade usam. Tudo via cliente COM tenant (design §4). */
@Injectable()
export class LeituraRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  async contasBancarias(pagina: number) {
    const [total, itens] = await Promise.all([
      this.db.bankAccount.count(),
      this.db.bankAccount.findMany({ orderBy: { id: 'asc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
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

  async extrato(pagina: number, ordem: Ordem) {
    const [total, itens, porTipo] = await Promise.all([
      this.db.statement.count(),
      this.db.statement.findMany({
        orderBy: { [CAMPO_PRISMA[ordem.campo]]: ordem.sentido },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      this.db.statement.groupBy({ by: ['statementableType'], _count: { _all: true }, _sum: { value: true } }),
    ]);
    return { total, itens, porTipo };
  }
}
