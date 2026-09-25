// T12 — REQ-CON-06 (atomicidade) e revisão de segurança #1 (corrida no saldo), contra o PostgreSQL real.
// Não observáveis por HTTP: por isso são testes de integração (a paridade marca RN-CON-007 como "n/a — T12").
import { ContasService } from '../src/modules/contas/application/contas.service';
import { ContasRepositorio, ContasTransacao } from '../src/modules/contas/infra/contas.repositorio';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { ContextoCliente } from '../src/shared/tenant/contexto-cliente';
import { criarPrismaTenant } from '../src/shared/tenant/prisma-tenant';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('contas: transação e concorrência (T12, integração)', () => {
  const base = new PrismaService();
  const servico = new ContasService(new ContasRepositorio(criarPrismaTenant(base)));
  let ctx: { clienteId: number; usuarioId: number };
  let categoria: number;
  let contaBancaria: number;
  const marca = `T12-${Date.now()}`;
  const comoCliente = <T>(fn: () => PromiseLike<T>) => ContextoCliente.executarAsync(ctx, fn);
  const saldo = async () => Number((await base.bankAccount.findUniqueOrThrow({ where: { id: contaBancaria } })).balance);
  const entrada = (extra = {}) => ({
    name: `${marca}-${Math.random().toString(36).slice(2, 7)}`, dateDue: '2027-08-01', value: '10.00', done: false,
    categoryId: categoria, bankAccountId: contaBancaria, ...extra,
  });

  beforeAll(async () => {
    const usuario = await base.user.findUniqueOrThrow({ where: { email: 'cliente1@user.com' } });
    ctx = { clienteId: usuario.clientId!, usuarioId: usuario.id };
    categoria = (await base.categoryExpense.findFirstOrThrow({ where: { clientId: ctx.clienteId } })).id;
    contaBancaria = (await base.bankAccount.findFirstOrThrow({ where: { clientId: ctx.clienteId } })).id;
  });

  afterAll(async () => {
    const ids = (await base.billPay.findMany({ where: { name: { startsWith: marca } }, select: { id: true } })).map((b) => b.id);
    if (ids.length) {
      await base.statement.deleteMany({ where: { statementableType: 'BillPay', statementableId: { in: ids } } });
      await base.billPay.deleteMany({ where: { id: { in: ids } } }); // nunca sem filtro (lição da T07)
    }
    await base.$disconnect();
  });

  it('REQ-CON-06: falha ao gravar o extrato → NADA é gravado (nem conta, nem saldo)', async () => {
    const saldoAntes = await saldo();
    const e = entrada({ done: true });
    const espiao = jest.spyOn(ContasTransacao.prototype, 'registrarExtrato').mockRejectedValueOnce(new Error('falha injetada'));
    await expect(comoCliente(() => servico.criar('pagar', e, ctx))).rejects.toThrow('falha injetada');
    espiao.mockRestore();
    expect(await base.billPay.count({ where: { name: e.name } })).toBe(0);
    expect(await saldo()).toBe(saldoAntes);
  });

  it('sem falha, a mesma operação grava conta + saldo + extrato com auditoria', async () => {
    const saldoAntes = await saldo();
    const conta = await comoCliente(() => servico.criar('pagar', entrada({ done: true }), ctx));
    expect(await saldo()).toBeCloseTo(saldoAntes - 10, 2);
    const extrato = await base.statement.findFirstOrThrow({ where: { statementableType: 'BillPay', statementableId: conta.id } });
    expect({ user: extrato.userId, acao: extrato.action, kind: extrato.kind, valor: Number(extrato.value) })
      .toEqual({ user: ctx.usuarioId, acao: 'criacao', kind: 'movimento', valor: -10 });
  });

  it('revisão #1: dois pagamentos SIMULTÂNEOS da mesma conta → exatamente UM débito', async () => {
    const conta = await comoCliente(() => servico.criar('pagar', entrada(), ctx));
    const saldoAntes = await saldo();
    const pagar = () => comoCliente(() => servico.atualizar('pagar', conta.id, { ...entrada(), name: conta.name, done: true }, ctx));
    await Promise.all([pagar(), pagar(), pagar()]);
    expect(await saldo()).toBeCloseTo(saldoAntes - 10, 2);
    expect(await base.statement.count({ where: { statementableType: 'BillPay', statementableId: conta.id } })).toBe(1);
  });

  it('revisão do código #1: 8 criações PAGAS simultâneas na MESMA conta bancária → sem deadlock, 8 débitos', async () => {
    const saldoAntes = await saldo();
    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () => comoCliente(() => servico.criar('pagar', entrada({ done: true }), ctx))),
    );
    const falhas = resultados.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message ?? r));
    expect(falhas).toEqual([]);
    expect(await saldo()).toBeCloseTo(saldoAntes - 80, 2);
  });

  it('exclusão de conta paga estorna e PRESERVA o histórico (REQ-CON-09)', async () => {
    const conta = await comoCliente(() => servico.criar('pagar', entrada({ done: true }), ctx));
    const saldoAntes = await saldo();
    await comoCliente(() => servico.excluir('pagar', conta.id, ctx));
    expect(await saldo()).toBeCloseTo(saldoAntes + 10, 2);
    const extratos = await base.statement.findMany({ where: { statementableType: 'BillPay', statementableId: conta.id }, orderBy: { id: 'asc' } });
    expect(extratos.map((x) => [x.kind, x.action, Number(x.value)])).toEqual([['movimento', 'criacao', -10], ['estorno', 'exclusao', 10]]);
  });
});
