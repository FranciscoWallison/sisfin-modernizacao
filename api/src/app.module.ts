import { Module } from '@nestjs/common';
import { HealthController } from './shared/http/health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule {}
