import type { INestApplication } from '@nestjs/common';
import type { Config } from '../config/config';
import { ExcecoesFilter } from './excecoes.filter';
import { criarValidationPipe } from './validacao';

/** Aplica o formato HTTP compatível (T05). Usado no main.ts e nos testes e2e — mesmo comportamento nos dois. */
export function configurarApp(app: INestApplication, config: Config): void {
  app.useGlobalPipes(criarValidationPipe());
  app.useGlobalFilters(new ExcecoesFilter());
  // CORS com allowlist (o legado usava "*" — revisão de segurança #12)
  app.enableCors({ origin: config.origensCors.length ? config.origensCors : false });
}
