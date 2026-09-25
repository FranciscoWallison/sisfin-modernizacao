import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClienteInterceptor, ClienteObrigatorioGuard } from './com-cliente';
import { criarPrismaTenant, PRISMA_TENANT } from './prisma-tenant';

@Global()
@Module({
  providers: [
    { provide: PRISMA_TENANT, useFactory: (base: PrismaService) => criarPrismaTenant(base), inject: [PrismaService] },
    ClienteObrigatorioGuard,
    ClienteInterceptor,
  ],
  exports: [PRISMA_TENANT, ClienteObrigatorioGuard, ClienteInterceptor],
})
export class TenantModule {}
