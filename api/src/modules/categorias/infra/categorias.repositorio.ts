import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHAVES_ADVISORY_LOCK } from '../../../shared/prisma/chaves-lock';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';
import type { Categoria, TipoArvore } from '../domain/arvore';

// Acesso a dados das categorias (design §3). Leituras e escritas pelo cliente COM tenant; o SQL cru (advisory lock e
// renumeração) recebe clientId explícito e o usa no WHERE (lint da T02). Tabelas por constante, nunca da entrada.

const TABELA = { receita: Prisma.raw('"category_revenues"'), despesa: Prisma.raw('"category_expenses"') } as const;
const CHAVE_LOCK = { receita: CHAVES_ADVISORY_LOCK.arvoreDeReceitas, despesa: CHAVES_ADVISORY_LOCK.arvoreDeDespesas } as const; // 2º argumento: o cliente

/** Espera máxima por lock (S2): um cliente com muitas escritas simultâneas não prende conexões do pool sem fim — após
 * 3 s o Postgres desiste (55P03) e a resposta é 409 (o cliente pode repetir). SET LOCAL: só nesta transação. */
const LIMITAR_ESPERA_DE_LOCK = Prisma.sql`SET LOCAL lock_timeout = '3s'`;

export type Tx = Prisma.TransactionClient;
const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o Laravel

/** Operações dentro de UMA transação. Criado só por CategoriasRepositorio.transacao(). */
export class CategoriasTransacao {
  constructor(private readonly tx: Tx) {}

  private modelo(tipo: TipoArvore) {
    return tipo === 'despesa' ? this.tx.categoryExpense : (this.tx.categoryRevenue as unknown as Tx['categoryExpense']);
  }

  /** Serializa as escritas da árvore (receita|despesa) DO CLIENTE até o fim da transação. */
  async travarArvore(tipo: TipoArvore, clientId: number): Promise<void> {
    await this.tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(${CHAVE_LOCK[tipo]}::int, ${clientId}::int)`;
  }

  /** Todas as categorias do cliente naquela árvore (o filtro de cliente vem da extensão de tenant). */
  categorias(tipo: TipoArvore): Promise<Categoria[]> {
    return this.modelo(tipo).findMany({ orderBy: { id: 'asc' } });
  }

  /** Nasce com _lft/_rgt provisórios (0); a renumeração do mesmo passo os corrige. */
  criar(tipo: TipoArvore, d: { name: string; parentId: number | null }): Promise<Categoria> {
    const t = agora();
    return this.modelo(tipo).create({ data: { ...d, lft: 0, rgt: 0, createdAt: t, updatedAt: t } as never });
  }

  atualizar(tipo: TipoArvore, id: number, d: { name: string; parentId: number | null }): Promise<Categoria> {
    return this.modelo(tipo).update({ where: { id }, data: { ...d, updatedAt: agora() } });
  }

  async excluir(tipo: TipoArvore, ids: number[]): Promise<number> {
    return (await this.modelo(tipo).deleteMany({ where: { id: { in: ids } } })).count;
  }

  /** Há conta a pagar/receber em alguma dessas categorias? (REQ-CAT-05) */
  async temContas(tipo: TipoArvore, ids: number[]): Promise<boolean> {
    const where = { categoryId: { in: ids } };
    const n = tipo === 'despesa' ? await this.tx.billPay.count({ where }) : await this.tx.billReceive.count({ where });
    return n > 0;
  }

  /**
   * Grava a nova numeração SÓ nas linhas do cliente (WHERE client_id). Se alguma linha não for atualizada, algo
   * tentou numerar categoria de outro cliente → erro (e a transação desfaz tudo).
   */
  async renumerar(tipo: TipoArvore, clientId: number, linhas: { id: number; lft: number; rgt: number }[]): Promise<void> {
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500);
      const valores = Prisma.join(lote.map((l) => Prisma.sql`(${l.id}::int, ${l.lft}::int, ${l.rgt}::int)`));
      const n = await this.tx.$executeRaw`
        UPDATE ${TABELA[tipo]} AS t SET "_lft" = v.lft, "_rgt" = v.rgt
        FROM (VALUES ${valores}) AS v(id, lft, rgt)
        WHERE t.id = v.id AND t.client_id = ${clientId}`;
      if (n !== lote.length) throw new Error(`renumeração: ${n} de ${lote.length} linhas do cliente atualizadas`);
    }
  }
}

@Injectable()
export class CategoriasRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  transacao<T>(fn: (t: CategoriasTransacao) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(LIMITAR_ESPERA_DE_LOCK);
      return fn(new CategoriasTransacao(tx as unknown as Tx));
    });
  }

  categorias(tipo: TipoArvore): Promise<Categoria[]> {
    const args = { orderBy: { id: 'asc' as const } };
    return tipo === 'despesa' ? this.db.categoryExpense.findMany(args) : this.db.categoryRevenue.findMany(args);
  }
}
