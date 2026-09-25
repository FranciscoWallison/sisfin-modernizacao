import { Module } from '@nestjs/common';
import { ContasService } from './application/contas.service';
import { ContasAPagarController, ContasAReceberController } from './http/contas.controller';
import { ContasRepositorio } from './infra/contas.repositorio';

@Module({
  controllers: [ContasAPagarController, ContasAReceberController],
  providers: [ContasService, ContasRepositorio],
})
export class ContasModule {}
