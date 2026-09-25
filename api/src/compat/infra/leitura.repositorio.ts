import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_TENANT, PrismaTenant } from '../../shared/tenant/prisma-tenant';

export type Sentido = 'asc' | 'desc';
export const ORDEM_CONTA_BANCARIA = { id: 'id', name: 'name', agency: 'agency', account: 'account', balance: 'balance' } as const;

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

  contaBancaria(id: number, comBanco = false) {
    return this.db.bankAccount.findUnique({ where: { id }, include: { bank: comBanco } });
  }

  listaContasBancarias() {
    return this.db.bankAccount.findMany({ select: { id: true, name: true, account: true }, orderBy: { id: 'asc' } });
  }
}
