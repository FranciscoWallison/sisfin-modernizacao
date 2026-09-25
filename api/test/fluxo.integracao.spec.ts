// F03 — fluxo de caixa contra o PostgreSQL real (roda com DATABASE_URL; banco vindo do ETL).
import { FluxoRepositorio } from '../src/modules/fluxo-de-caixa/infra/fluxo.repositorio';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { criarPrismaTenant } from '../src/shared/tenant/prisma-tenant';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('fluxo de caixa no banco (F03, integração)', () => {
  const base = new PrismaService();
  const repo = new FluxoRepositorio(criarPrismaTenant(base));
  const criados = { categorias: [] as number[], contas: [] as number[], recebimentos: [] as number[], extratos: [] as number[] };
  let clienteA: number;
  let clienteB: number;

  beforeAll(async () => {
    const [a, b] = await base.client.findMany({ orderBy: { id: 'asc' }, take: 2 });
    [clienteA, clienteB] = [a.id, b.id];
  });

  afterAll(async () => {
    // limpeza só com ids definidos (lição da T07)
    if (criados.extratos.length) await base.statement.deleteMany({ where: { id: { in: criados.extratos } } });
    if (criados.contas.length) await base.billPay.deleteMany({ where: { id: { in: criados.contas } } });
    if (criados.recebimentos.length) await base.billReceive.deleteMany({ where: { id: { in: criados.recebimentos } } });
    if (criados.categorias.length) await base.categoryExpense.deleteMany({ where: { id: { in: criados.categorias } } });
    await base.$disconnect();
  });

  // Profundidade DENTRO do cliente: desde o ADR-007 o nested set é numerado por cliente (faixas de clientes diferentes
  // se sobrepõem de propósito) — e é assim que o fluxo o usa (JOIN com c.client_id = r.client_id).
  it('parent_id IS NULL equivale à "profundidade 0" (no cliente) no banco migrado — despesas E receitas (design §7)', async () => {
    const despesas = await base.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM category_expenses r
      WHERE (r.parent_id IS NULL) <> ((SELECT COUNT(*) FROM category_expenses d WHERE d.client_id = r.client_id AND r._lft BETWEEN d._lft AND d._rgt) - 1 = 0)`;
    const receitas = await base.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM category_revenues r
      WHERE (r.parent_id IS NULL) <> ((SELECT COUNT(*) FROM category_revenues d WHERE d.client_id = r.client_id AND r._lft BETWEEN d._lft AND d._rgt) - 1 = 0)`;
    expect([Number(despesas[0].n), Number(receitas[0].n)]).toEqual([0, 0]);
  });

  // Revisão de segurança do módulo: o teste da árvore corrompida não provava cada filtro sozinho. Este caso só é barrado
  // por b.client_id — a categoria é LEGÍTIMA do cliente A; é a conta do cliente B que aponta para ela.
  it.each([
    ['despesas', 'categoryExpense', 'billPay'],
    ['receitas', 'categoryRevenue', 'billReceive'],
  ] as const)('REQ-FLX-07 (%s): conta de B apontando para categoria LEGÍTIMA de A não entra no fluxo de A', async (lado, modeloCat, modeloConta) => {
    const raizA = await (base[modeloCat] as any).findFirstOrThrow({ where: { clientId: clienteA, parentId: null }, orderBy: { id: 'asc' } });
    const contaB = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteB } });
    const conta = await (base[modeloConta] as any).create({
      data: { name: 'F06-B-NA-CATEGORIA-DE-A', dateDue: new Date('2019-07-15T00:00:00Z'), value: '555.55', done: true, clientId: clienteB, categoryId: raizA.id, bankAccountId: contaB.id },
    });
    (lado === 'despesas' ? criados.contas : criados.recebimentos).push(conta.id);
    const linhas = await repo.somarPorCategoriaRaiz(lado, clienteA, '2019-07-01', '2019-07-31', 'mes');
    expect(linhas.find((l) => l.id === raizA.id)).toBeUndefined();
  });

  it('revisão do módulo: extrato de A apontando para conta bancária de B não entra no saldo de A', async () => {
    const contaB = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteB } });
    const antes = Number(await repo.saldoAntesDe(clienteA, '1990-01-01'));
    const e = await base.statement.create({
      data: { value: '1', balance: '999.99', bankAccountId: contaB.id, clientId: clienteA, statementableId: 0, statementableType: 'BillPay', createdAt: new Date('1989-06-01T00:00:00Z') },
    });
    criados.extratos.push(e.id);
    expect(Number(await repo.saldoAntesDe(clienteA, '1990-01-01'))).toBeCloseTo(antes, 2);
  });

  it('REQ-FLX-07: árvore CORROMPIDA de propósito (filha de B dentro da raiz de A) não vaza valores de B para A', async () => {
    const raizA = await base.categoryExpense.findFirstOrThrow({ where: { clientId: clienteA, parentId: null }, orderBy: { id: 'asc' } });
    const contaB = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteB } });
    // categoria do cliente B com _lft/_rgt DENTRO da faixa da raiz de A — exatamente o que o legado vazaria
    const intrusa = await base.categoryExpense.create({
      data: { name: 'INTRUSA-F03', clientId: clienteB, lft: raizA.lft, rgt: raizA.lft, parentId: raizA.id },
    });
    criados.categorias.push(intrusa.id);
    const conta = await base.billPay.create({
      data: { name: 'F03-VAZAMENTO', dateDue: new Date('2019-06-15T00:00:00Z'), value: '777.77', done: false, clientId: clienteB, categoryId: intrusa.id, bankAccountId: contaB.id },
    });
    criados.contas.push(conta.id);

    const linhasA = await repo.somarPorCategoriaRaiz('despesas', clienteA, '2019-06-01', '2019-06-30', 'mes');
    expect(linhasA.find((l) => l.id === raizA.id)).toBeUndefined(); // o legado (sem client_id na filha/conta) somaria 777,77

    // controle: o SQL do legado (client_id só na raiz) VAZA — prova de que o teste testa o que diz
    const legado = await base.$queryRaw<{ total: string }[]>`
      SELECT SUM(b.value)::text AS total FROM category_expenses r
      JOIN category_expenses c ON r._lft <= c._lft AND r._rgt >= c._rgt
      JOIN bill_pays b ON b.category_id = c.id
      WHERE r.id = ${raizA.id} AND r.client_id = ${clienteA} AND b.date_due BETWEEN '2019-06-01' AND '2019-06-30'`;
    expect(legado[0].total).toBe('777.77');
  });

  it('REQ-FLX-06: extrato lançado às 23h do ÚLTIMO dia do mês entra no saldo anterior (o legado cortava às 00:00)', async () => {
    const conta = await base.bankAccount.findFirstOrThrow({ where: { clientId: clienteA } });
    const antes = Number(await repo.saldoAntesDe(clienteA, '2000-01-01'));
    const antesB = Number(await repo.saldoAntesDe(clienteB, '2000-01-01'));
    const e = await base.statement.create({
      data: { value: '1', balance: '123.45', bankAccountId: conta.id, clientId: clienteA, statementableId: 0, statementableType: 'BillPay', createdAt: new Date('1999-12-31T23:00:00Z') },
    });
    criados.extratos.push(e.id);
    expect(Number(await repo.saldoAntesDe(clienteA, '2000-01-01'))).toBeCloseTo(antes + 123.45, 2);
    expect(Number(await repo.saldoAntesDe(clienteA, '1999-12-31'))).toBeCloseTo(antes, 2); // corte do legado perderia
    // outro cliente: medido antes e depois (a asserção anterior só falharia por coincidência numérica — revisão do módulo)
    expect(Number(await repo.saldoAntesDe(clienteB, '2000-01-01'))).toBeCloseTo(antesB, 2);
  });
});
