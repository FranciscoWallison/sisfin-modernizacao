import { Module } from '@nestjs/common';
import { AdminBancosService } from './application/admin-bancos.service';
import { AdminBancosController } from './http/admin-bancos.controller';
import { ArquivosDeLogo } from './infra/arquivos';
import { BancosRepositorio } from './infra/bancos.repositorio';

@Module({
  controllers: [AdminBancosController],
  providers: [AdminBancosService, BancosRepositorio, ArquivosDeLogo],
})
export class AdminBancosModule {}
