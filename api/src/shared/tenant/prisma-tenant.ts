import { PrismaService } from '../prisma/prisma.service';
import { ContextoCliente } from './contexto-cliente';
import { aplicarTenant } from './regras-tenant';

/**
 * Cliente Prisma COM filtro de tenant — o único que repositórios de infra/ usam (regra de camadas).
 * SQL cru ($queryRaw) não passa por aqui: só em infra/, com clientId explícito (lint da T02).
 */
export function criarPrismaTenant(base: PrismaService) {
  return base.$extends({
    name: 'tenant',
    query: {
      $allModels: {
        // query(args) — e não base[modelo][op](args): só o query() continua dentro de uma transação interativa
        $allOperations({ model, operation, args, query }) {
          return query(aplicarTenant(model, operation, args, ContextoCliente.atual()?.clienteId) as typeof args);
        },
      },
    },
  });
}

export type PrismaTenant = ReturnType<typeof criarPrismaTenant>;
export const PRISMA_TENANT = Symbol('PRISMA_TENANT');
