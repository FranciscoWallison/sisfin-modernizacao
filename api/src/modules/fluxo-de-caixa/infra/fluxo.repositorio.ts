import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';

// Agregações do fluxo de caixa (design §3). SQL cru porque é uma agregação sobre nested set; por isso recebe
// clientId explícito e o aplica na raiz, nas filhas E nas contas (REQ-FLX-07 — o legado só filtrava a raiz).
// Nomes de tabela e formato de data vêm de constantes (Prisma.raw), nunca da entrada.

const TABELAS = {
  receitas: { categoria: Prisma.raw('"category_revenues"'), conta: Prisma.raw('"bill_receives"') },
  despesas: { categoria: Prisma.raw('"category_expenses"'), conta: Prisma.raw('"bill_pays"') },
} as const;
const FORMATO = { mes: Prisma.raw(`'YYYY-MM'`), dia: Prisma.raw(`'YYYY-MM-DD'`) } as const;

export type Lado = keyof typeof TABELAS;

export interface LinhaSql {
  id: number;
  name: string;
  period: string;
  total: string; // decimal em texto
}

@Injectable()
export class FluxoRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  /** Soma por categoria RAIZ e período (RN-FLX-005). Ordem: período, nome (sem diferenciar maiúsculas, como o MySQL). */
  somarPorCategoriaRaiz(
    lado: Lado, clientId: number, inicio: string, fim: string, formato: keyof typeof FORMATO, somentePagas = false,
  ): Promise<LinhaSql[]> {
    const t = TABELAS[lado];
    const pagas = somentePagas ? Prisma.sql`AND b.done = true` : Prisma.empty;
    return this.db.$queryRaw<LinhaSql[]>`
      SELECT r.id, r.name, to_char(b.date_due, ${FORMATO[formato]}) AS period, SUM(b.value)::text AS total
      FROM ${t.categoria} r
      JOIN ${t.categoria} c ON c._lft >= r._lft AND c._rgt <= r._rgt AND c.client_id = r.client_id
      JOIN ${t.conta} b ON b.category_id = c.id AND b.client_id = r.client_id
      WHERE r.client_id = ${clientId} AND r.parent_id IS NULL
        AND b.date_due BETWEEN ${inicio}::date AND ${fim}::date
        ${pagas}
      GROUP BY r.id, r.name, period
      ORDER BY period, lower(r.name), r.name, r.id`; // id por último: desempate estável no mesmo nome (RN-FLX-008)
  }

  /** RN-FLX-006: soma do saldo do ÚLTIMO extrato (maior id) de cada conta bancária lançado antes do corte. */
  async saldoAntesDe(clientId: number, corte: string): Promise<string> {
    const [r] = await this.db.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(s.balance), 0)::text AS total
      FROM statements s
      JOIN (
        SELECT bank_account_id, MAX(id) AS id FROM statements
        WHERE client_id = ${clientId} AND created_at < ${corte}::timestamp
        GROUP BY bank_account_id
      ) u ON u.id = s.id`;
    return r.total;
  }
}
