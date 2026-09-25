import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';
import { CampoDeOrdem, Intervalo, POR_PAGINA, Sentido } from '../domain/consulta';

// Extrato (design §2): lista, contagem e totais com o MESMO where — no legado a ordenação entrava na consulta dos
// totais e quebrava (COUNT(id) ambíguo, RN-EXT-005). O cliente do lançamento vem da extensão de tenant.

@Injectable()
export class ExtratoRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  /**
   * Defesa em profundidade (design §2): além do lançamento, a conta bancária também tem de ser do cliente — o
   * include=bankAccount segue a FK e não passa pelo filtro de tenant. Com dados íntegros, o resultado é o mesmo.
   */
  private where(clienteId: number, intervalo: Intervalo | null): Prisma.StatementWhereInput {
    return {
      bankAccount: { is: { clientId: clienteId } },
      ...(intervalo ? { createdAt: { gte: intervalo.desde, lt: intervalo.ate } } : {}),
    };
  }

  private ordem(campo: CampoDeOrdem, sentido: Sentido): Prisma.StatementOrderByWithRelationInput[] {
    const principal = campo === 'nomeDaConta' ? { bankAccount: { name: sentido } } : { [campo]: sentido };
    return [principal, { id: 'asc' }]; // desempate estável (no MySQL do legado, empates não eram determinísticos)
  }

  async listar(clienteId: number, pagina: number, ordem: { campo: CampoDeOrdem; sentido: Sentido }, intervalo: Intervalo | null, comConta: boolean) {
    const where = this.where(clienteId, intervalo);
    const [total, itens, porTipo] = await Promise.all([
      this.db.statement.count({ where }),
      this.db.statement.findMany({
        where,
        include: { bankAccount: comConta },
        orderBy: this.ordem(ordem.campo, ordem.sentido),
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
      // totais: mesmo where, SEM ordenação (REQ-EXT-02)
      this.db.statement.groupBy({ by: ['statementableType'], where, _count: { _all: true }, _sum: { value: true } }),
    ]);
    return { total, itens, porTipo };
  }
}
