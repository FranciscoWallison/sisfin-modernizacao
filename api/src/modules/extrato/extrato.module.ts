import { Module } from '@nestjs/common';
import { ExtratoService } from './application/extrato.service';
import { ExtratoController } from './http/extrato.controller';
import { ExtratoRepositorio } from './infra/extrato.repositorio';

@Module({ controllers: [ExtratoController], providers: [ExtratoService, ExtratoRepositorio] })
export class ExtratoModule {}
