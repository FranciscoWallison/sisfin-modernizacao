import { Module } from '@nestjs/common';
import { LeituraRepositorio } from './infra/leitura.repositorio';
import { LeituraController } from './leitura.controller';

@Module({ controllers: [LeituraController], providers: [LeituraRepositorio] })
export class CompatModule {}
