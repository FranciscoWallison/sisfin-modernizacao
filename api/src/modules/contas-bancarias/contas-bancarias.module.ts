import { Module } from '@nestjs/common';
import { ContasBancariasService } from './application/contas-bancarias.service';
import { ContasBancariasController } from './http/contas-bancarias.controller';
import { ContasBancariasRepositorio } from './infra/contas-bancarias.repositorio';

@Module({
  controllers: [ContasBancariasController],
  providers: [ContasBancariasService, ContasBancariasRepositorio],
})
export class ContasBancariasModule {}
