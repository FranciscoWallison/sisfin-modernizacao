import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Cliente Prisma BASE (sem filtro de tenant). Uso restrito: shared/ (auth, tenant) e a extensão de tenant (T07). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
