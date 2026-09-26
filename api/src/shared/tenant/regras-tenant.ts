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
  'Subscription', // assinaturas (ADR-011): a assinatura é do cliente
]);

export class ViolacaoTenantError extends Error {}

type Args = Record<string, any>;

const comCliente = (where: unknown, clienteId: number) => ({ AND: [where ?? {}, { clientId: clienteId }] });

/** Valor escalar aceitável num `data`: primitivo, Date ou decimal (Prisma.Decimal / texto). */
const escalar = (v: unknown) =>
  v === null || typeof v !== 'object' || v instanceof Date || typeof (v as { toFixed?: unknown }).toFixed === 'function';

/**
 * Escrita aninhada é proibida POR INTEIRO (connect, create, update, upsert, delete…): a extensão não filtra o que
 * vai dentro dela. Só campos escalares — ex.: bankAccountId em vez de bankAccount: { connect } (revisão do código).
 */
function semConnect(valor: unknown, caminho = 'data'): void {
  if (!valor || typeof valor !== 'object') return;
  for (const [k, v] of Object.entries(valor)) {
    if (!escalar(v)) {
      throw new ViolacaoTenantError(`escrita aninhada em ${caminho}.${k} é proibida: use o campo escalar (ex.: bankAccountId)`);
    }
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
