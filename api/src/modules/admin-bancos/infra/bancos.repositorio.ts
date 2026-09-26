import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHAVES_ADVISORY_LOCK } from '../../../shared/prisma/chaves-lock';
import { PRISMA_TENANT, PrismaTenant } from '../../../shared/tenant/prisma-tenant';

// Bancos para o admin (design §1, ADR-010). Bank NÃO tem tenant: é a lista global que todo cliente vê. A proteção é o
// SomenteAdminGuard. SQL cru (exceção documentada no sensor de arquitetura — só `banks` e `bank_accounts`):
// - trava a linha do banco (FOR UPDATE) para que duas edições do mesmo banco não removam o logo uma da outra;
// - "em uso" é GLOBAL (conta de qualquer cliente): EXISTS, sem devolver dado de cliente nenhum.

export type Tx = Prisma.TransactionClient;
const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o Laravel
const LIMITAR_ESPERA_DE_LOCK = Prisma.sql`SET LOCAL lock_timeout = '3s'`; // como nos outros módulos (S2)

export interface DadosBanco {
  name: string;
  logo?: string; // ausente na edição = mantém o atual
}

/** Operações dentro de UMA transação. Criado só por BancosRepositorio.transacao(). */
export class BancosTransacao {
  constructor(private readonly tx: Tx) {}

  /** Trava o banco e devolve o logo atual; null se não existe. */
  async travar(id: number): Promise<{ logo: string } | null> {
    const [linha] = await this.tx.$queryRaw<{ logo: string }[]>`SELECT logo FROM banks WHERE id = ${id} FOR UPDATE`;
    return linha ?? null;
  }

  /**
   * Serializa a decisão de remover um arquivo de logo entre bancos DIFERENTES que apontam para ele (dado migrado):
   * sem isto, duas trocas simultâneas viam uma à outra ainda usando o arquivo e nenhuma o removia (A06, S3).
   */
  async travarLogo(logo: string): Promise<void> {
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAVES_ADVISORY_LOCK.logoDeBanco}::int, hashtext(${logo}))`;
  }

  /** Alguma conta bancária (de QUALQUER cliente) usa o banco? REQ-ADB-05. */
  async emUso(id: number): Promise<boolean> {
    const [r] = await this.tx.$queryRaw<{ existe: boolean }[]>`SELECT EXISTS (SELECT 1 FROM bank_accounts WHERE bank_id = ${id}) AS existe`;
    return r.existe;
  }

  atualizar(id: number, d: DadosBanco) {
    return this.tx.bank.update({ where: { id }, data: { ...d, updatedAt: agora() } });
  }

  excluir(id: number) {
    return this.tx.bank.delete({ where: { id } });
  }

  /** Outro banco ainda aponta para o arquivo? (dado migrado pode repetir nomes) — então ele não é removido. */
  async logoCompartilhado(logo: string, excetoId: number): Promise<boolean> {
    return (await this.tx.bank.count({ where: { logo, id: { not: excetoId } } })) > 0;
  }
}

@Injectable()
export class BancosRepositorio {
  constructor(@Inject(PRISMA_TENANT) private readonly db: PrismaTenant) {}

  transacao<T>(fn: (t: BancosTransacao) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw(LIMITAR_ESPERA_DE_LOCK);
      return fn(new BancosTransacao(tx as unknown as Tx));
    });
  }

  /** Página de bancos em ordem de id (RN-ADB-001: 5 por página no legado). */
  async pagina(pagina: number, porPagina: number) {
    const [itens, total] = await Promise.all([
      this.db.bank.findMany({ orderBy: { id: 'asc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.db.bank.count(),
    ]);
    return { itens, total };
  }

  porId(id: number) {
    return this.db.bank.findUnique({ where: { id } });
  }

  criar(d: Required<DadosBanco>) {
    const t = agora();
    return this.db.bank.create({ data: { ...d, createdAt: t, updatedAt: t } });
  }
}
