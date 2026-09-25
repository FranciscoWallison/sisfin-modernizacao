// T07 — filtro de tenant, operação por operação (design §4, revisão de segurança #2). Função pura: sem banco.
import { aplicarTenant, MODELOS_COM_TENANT, ViolacaoTenantError } from '../src/shared/tenant/regras-tenant';

const CLIENTE = 2;
const aplicar = (op: string, args: any) => aplicarTenant('BillPay', op, args, CLIENTE);

describe('regras de tenant (T07)', () => {
  it('lista fechada de modelos com tenant', () => {
    expect([...MODELOS_COM_TENANT].sort()).toEqual(
      ['BankAccount', 'BillPay', 'BillReceive', 'CategoryExpense', 'CategoryRevenue', 'Statement'].sort(),
    );
  });

  it('modelo sem tenant (User, Client, Bank) passa intacto, mesmo sem cliente no contexto', () => {
    expect(aplicarTenant('User', 'findUnique', { where: { id: 1 } }, undefined)).toEqual({ where: { id: 1 } });
  });

  it('SEM cliente no contexto → erro (falha fechada, nunca "sem filtro")', () => {
    expect(() => aplicarTenant('BillPay', 'findMany', {}, undefined)).toThrow(ViolacaoTenantError);
  });

  it.each(['findUnique', 'findUniqueOrThrow', 'delete'])('%s → where único estendido com clientId', (op) => {
    expect(aplicar(op, { where: { id: 7 } })).toEqual({ where: { id: 7, clientId: CLIENTE } });
  });

  it.each(['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'deleteMany'])(
    '%s → AND com clientId (sem apagar o filtro original)',
    (op) => {
      expect(aplicar(op, { where: { done: true }, take: 5 })).toEqual({
        where: { AND: [{ done: true }, { clientId: CLIENTE }] },
        take: 5,
      });
    },
  );

  it('findMany sem where também é filtrado', () => {
    expect(aplicar('findMany', undefined)).toEqual({ where: { AND: [{}, { clientId: CLIENTE }] } });
  });

  it('create SOBRESCREVE clientId vindo de fora (mass assignment)', () => {
    expect(aplicar('create', { data: { name: 'x', clientId: 999 } })).toEqual({ data: { name: 'x', clientId: CLIENTE } });
  });

  it('createMany sobrescreve em cada linha', () => {
    expect(aplicar('createMany', { data: [{ name: 'a', clientId: 9 }, { name: 'b' }] }).data).toEqual([
      { name: 'a', clientId: CLIENTE },
      { name: 'b', clientId: CLIENTE },
    ]);
  });

  it('update / updateMany REMOVEM clientId do data (ninguém troca o dono) e filtram o where', () => {
    expect(aplicar('update', { where: { id: 1 }, data: { name: 'y', clientId: 999 } })).toEqual({
      where: { id: 1, clientId: CLIENTE },
      data: { name: 'y' },
    });
    expect(aplicar('updateMany', { where: { done: false }, data: { done: true, clientId: 9 } })).toEqual({
      where: { AND: [{ done: false }, { clientId: CLIENTE }] },
      data: { done: true },
    });
  });

  it('upsert: where filtrado, create com cliente, update sem trocar o dono', () => {
    expect(aplicar('upsert', { where: { id: 1 }, create: { name: 'n', clientId: 9 }, update: { clientId: 9 } })).toEqual({
      where: { id: 1, clientId: CLIENTE },
      create: { name: 'n', clientId: CLIENTE },
      update: {},
    });
  });

  it.each(['connect', 'connectOrCreate', 'set'])('escrita aninhada com "%s" é proibida', (chave) => {
    expect(() => aplicar('create', { data: { name: 'x', bankAccount: { [chave]: { id: 1 } } } })).toThrow(/proibida/);
    expect(() => aplicar('update', { where: { id: 1 }, data: { bankAccount: { [chave]: { id: 1 } } } })).toThrow(/proibida/);
  });

  it.each(['create', 'update', 'upsert', 'delete', 'updateMany'])('revisão do código: escrita aninhada "%s" também é proibida', (op) => {
    expect(() => aplicar('create', { data: { name: 'x', bankAccount: { [op]: { id: 1 } } } })).toThrow(/proibida/);
  });

  it('Date e decimal são escalares aceitos no data', () => {
    expect(() => aplicar('create', { data: { dateDue: new Date(), value: { toFixed: () => '10.00' } } })).not.toThrow();
  });

  it('operação desconhecida → erro (não passa sem filtro)', () => {
    expect(() => aplicar('findRaw', {})).toThrow(/não é tratada/);
  });
});
