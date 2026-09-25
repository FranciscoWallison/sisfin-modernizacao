import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CompatModule } from './compat/compat.module';
import { ContasModule } from './modules/contas/contas.module';
import { FluxoDeCaixaModule } from './modules/fluxo-de-caixa/fluxo-de-caixa.module';
import { AuthCompatModule } from './shared/auth-compat/auth-compat.module';
import { HealthController } from './shared/http/health.controller';
import { LogMiddleware } from './shared/http/log.middleware';
import { PrismaModule } from './shared/prisma/prisma.module';
import { TenantModule } from './shared/tenant/tenant.module';

@Module({
  imports: [PrismaModule, AuthCompatModule, TenantModule, CompatModule, ContasModule, FluxoDeCaixaModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LogMiddleware).forRoutes('*');
  }
}
