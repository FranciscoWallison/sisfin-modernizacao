// Transformação PURA de uma operação do Prisma para o cliente do contexto (design §4, REQ-CON-07,
// revisão de segurança #2). A extensão do Prisma (extensao-tenant.ts) só aplica o que esta função decide.

/** Modelos com tenant — lista FECHADA. Modelo novo com client_id precisa entrar aqui (e no teste). */
export const MODELOS_COM_TENANT = new Set([
  'BillPay',
  'BillReceive',
  'BankAccount',
  'Statement',
  'CategoryExpense',
  'CategoryRevenue',
]);

export class ViolacaoTenantError extends Error {}

type Args = Record<string, any>;

const comCliente = (where: unknown, clienteId: number) => ({ AND: [where ?? {}, { clientId: clienteId }] });

function semConnect(valor: unknown, caminho = 'data'): void {
  if (!valor || typeof valor !== 'object') return;
  for (const [k, v] of Object.entries(valor)) {
    if (k === 'connect' || k === 'connectOrCreate' || k === 'set') {
      throw new ViolacaoTenantError(`escrita aninhada com "${k}" em ${caminho} é proibida: use o campo escalar (ex.: bankAccountId)`);
    }
    semConnect(v, `${caminho}.${k}`);
  }
}

function dadosComCliente(data: Args, clienteId: number): Args {
  semConnect(data);
  const { client: _ignorado, ...resto } = data; // relação "client" nunca vem de fora
  return { ...resto, clientId: clienteId }; // SEMPRE sobrescreve
}

function dadosSemCliente(data: Args): Args {
  semConnect(data);
  const { clientId: _c, client: _r, ...resto } = data; // update nunca troca o dono
  return resto;
}

/**
 * Devolve os argumentos já restritos ao cliente. A OPERAÇÃO NUNCA MUDA: a extensão precisa chamar o próprio
 * `query(args)` do Prisma para continuar dentro da transação interativa (`$transaction(async tx => …)`).
 * Lança ViolacaoTenantError se não houver cliente no contexto ou se a operação não for reconhecida.
 */
export function aplicarTenant(modelo: string, operacao: string, args: Args | undefined, clienteId: number | undefined): Args {
  const a: Args = { ...(args ?? {}) };
  if (!MODELOS_COM_TENANT.has(modelo)) return a;
  if (clienteId === undefined || clienteId === null) {
    throw new ViolacaoTenantError(`acesso a ${modelo}.${operacao} sem cliente no contexto: rota sem @ComCliente()?`);
  }

  switch (operacao) {
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'delete':
      // where único ESTENDIDO (Prisma ≥ 5): a chave única + clientId no mesmo nível
      return { ...a, where: { ...a.where, clientId: clienteId } };
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'deleteMany':
      return { ...a, where: comCliente(a.where, clienteId) };
    case 'updateMany':
    case 'updateManyAndReturn':
      return { ...a, where: comCliente(a.where, clienteId), data: dadosSemCliente(a.data ?? {}) };
    case 'update':
      return { ...a, where: { ...a.where, clientId: clienteId }, data: dadosSemCliente(a.data ?? {}) };
    case 'create':
      return { ...a, data: dadosComCliente(a.data ?? {}, clienteId) };
    case 'createMany':
    case 'createManyAndReturn': {
      const lista = Array.isArray(a.data) ? a.data : [a.data];
      return { ...a, data: lista.map((d: Args) => dadosComCliente(d, clienteId)) };
    }
    case 'upsert':
      return {
        ...a,
        where: { ...a.where, clientId: clienteId },
        create: dadosComCliente(a.create ?? {}, clienteId),
        update: dadosSemCliente(a.update ?? {}),
      };
    default:
      // Operação que esta lista não conhece: falha fechada em vez de passar sem filtro
      throw new ViolacaoTenantError(`operação ${modelo}.${operacao} não é tratada pelo filtro de tenant`);
  }
}
