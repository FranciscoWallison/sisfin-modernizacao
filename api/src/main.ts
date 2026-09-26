import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { lerConfig } from './shared/config/config';
import { configurarApp } from './shared/http/configurar-app';

async function bootstrap(): Promise<void> {
  const config = lerConfig(); // lança e impede o boot se a configuração for insegura
  // rawBody: o webhook do Stripe verifica a assinatura sobre o corpo CRU (ADR-011, REQ-ASS-03)
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configurarApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.porta);
  console.log(`sisfin-api ouvindo em :${config.porta}`);
}

void bootstrap();
