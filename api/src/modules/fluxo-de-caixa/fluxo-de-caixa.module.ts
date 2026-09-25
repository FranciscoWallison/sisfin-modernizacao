import { Module } from '@nestjs/common';
import { FluxoService } from './application/fluxo.service';
import { FluxoController } from './http/fluxo.controller';
import { FluxoRepositorio } from './infra/fluxo.repositorio';

@Module({ controllers: [FluxoController], providers: [FluxoService, FluxoRepositorio] })
export class FluxoDeCaixaModule {}
