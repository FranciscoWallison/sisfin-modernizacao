// T07 — extensão de tenant contra o PostgreSQL de verdade (roda quando DATABASE_URL existe; o banco vem do ETL).
// Cliente A cria um registro; cliente B não consegue ler, contar, agregar, alterar nem excluir — inclusive dentro de
// uma transação interativa (o que prova que o filtro usa o query() ligado ao tx).
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { ContextoCliente } from '../src/shared/tenant/contexto-cliente';
import { criarPrismaTenant, PrismaTenant } from '../src/shared/tenant/prisma-tenant';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('extensão de tenant no banco (T07, integração)', () => {
  const base = new PrismaService();
  let db: PrismaTenant;
  let clienteA: number;
  let clienteB: number;
  let id: number;
  const comoA = <T>(fn: () => PromiseLike<T>) => ContextoCliente.executarAsync({ clienteId: clienteA, usuarioId: 0 }, fn);
  const comoB = <T>(fn: () => PromiseLike<T>) => ContextoCliente.executarAsync({ clienteId: clienteB, usuarioId: 0 }, fn);

  beforeAll(async () => {
    db = criarPrismaTenant(base);
    const clientes = await base.client.findMany({ select: { id: true }, orderBy: { id: 'asc' }, take: 2 });
    if (clientes.length < 2) throw new Error('rode o ETL antes: node tools/migrar-dados.mjs --seed');
    [clienteA, clienteB] = clientes.map((c) => c.id);
    const nome = `TENANT-T07-${Date.now()}`;
    // clientId: 999999 no data é IGNORADO — a extensão sobrescreve com o cliente do contexto
    const criada = await comoA(() => db.categoryExpense.create({ data: { name: nome, lft: 0, rgt: 1, clientId: 999999 } }));
    id = criada.id;
    expect(criada.clientId).toBe(clienteA);
  });

  afterAll(async () => {
    // id undefined (beforeAll falhou) viraria "apague TODAS as categorias" — nunca limpar sem id definido
    if (typeof id === "number") await base.categoryExpense.delete({ where: { id } });
    await base.$disconnect();
  });

  it('A enxerga; B não (findUnique, findFirst, findMany, count)', async () => {
    expect(await comoA(() => db.categoryExpense.findUnique({ where: { id } }))).not.toBeNull();
    expect(await comoB(() => db.categoryExpense.findUnique({ where: { id } }))).toBeNull();
    expect(await comoB(() => db.categoryExpense.findFirst({ where: { id } }))).toBeNull();
    expect(await comoB(() => db.categoryExpense.findMany({ where: { id } }))).toEqual([]);
    expect(await comoB(() => db.categoryExpense.count({ where: { id } }))).toBe(0);
  });

  it('agregados e groupBy de B não incluem o registro de A', async () => {
    const agg = await comoB(() => db.categoryExpense.aggregate({ where: { id }, _count: { _all: true } }));
    expect(agg._count._all).toBe(0);
    const grupos = await comoB(() => db.categoryExpense.groupBy({ by: ['clientId'], where: { id } }));
    expect(grupos).toEqual([]);
  });

  it('B não altera nem exclui (update/delete → P2025; *Many → 0)', async () => {
    await expect(comoB(() => db.categoryExpense.update({ where: { id }, data: { name: 'invadido' } }))).rejects.toMatchObject({ code: 'P2025' });
    await expect(comoB(() => db.categoryExpense.delete({ where: { id } }))).rejects.toMatchObject({ code: 'P2025' });
    expect((await comoB(() => db.categoryExpense.updateMany({ where: { id }, data: { name: 'x' } }))).count).toBe(0);
    expect((await comoB(() => db.categoryExpense.deleteMany({ where: { id } }))).count).toBe(0);
    expect((await base.categoryExpense.findUnique({ where: { id } }))?.name).toMatch(/^TENANT-T07-/);
  });

  it('A não consegue "doar" o registro para B (update com clientId é ignorado)', async () => {
    await comoA(() => db.categoryExpense.update({ where: { id }, data: { clientId: clienteB } }));
    expect((await base.categoryExpense.findUnique({ where: { id } }))?.clientId).toBe(clienteA);
  });

  it('dentro de $transaction interativa o filtro continua valendo', async () => {
    const vistoPorB = await comoB(() => db.$transaction((tx) => tx.categoryExpense.findUnique({ where: { id } })));
    const vistoPorA = await comoA(() => db.$transaction((tx) => tx.categoryExpense.findUnique({ where: { id } })));
    expect(vistoPorB).toBeNull();
    expect(vistoPorA?.id).toBe(id);
  });

  it('sem cliente no contexto → erro (falha fechada)', async () => {
    await expect(db.categoryExpense.findMany()).rejects.toThrow(/sem cliente no contexto/);
  });
});

// Documenta a armadilha que motivou executarAsync: a promessa do Prisma é preguiçosa
(process.env.DATABASE_URL ? describe : describe.skip)('armadilha: promessa do Prisma fora do escopo', () => {
  const base = new PrismaService();
  afterAll(() => base.$disconnect());
  it('executar() síncrono + await FORA do escopo → a extensão não acha o cliente', async () => {
    const db = criarPrismaTenant(base);
    const promessa = ContextoCliente.executar({ clienteId: 1, usuarioId: 0 }, () => db.categoryExpense.count());
    await expect(promessa).rejects.toThrow(/sem cliente no contexto/);
  });
});
