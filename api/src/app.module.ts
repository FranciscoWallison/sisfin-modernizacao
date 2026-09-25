import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthCompatModule } from './shared/auth-compat/auth-compat.module';
import { HealthController } from './shared/http/health.controller';
import { LogMiddleware } from './shared/http/log.middleware';
import { PrismaModule } from './shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthCompatModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LogMiddleware).forRoutes('*');
  }
}
