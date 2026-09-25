import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { lerConfig } from '../config/config';
import { AuthController } from './auth.controller';
import { CONFIG } from './contexto';
import { LimiteRequisicoes, ListaNegra, TentativasLogin } from './controles';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LimiteRequisicoesGuard } from './limite-requisicoes.guard';
import { PrismaUsuariosRepositorio, UsuariosRepositorio } from './usuarios.repositorio';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: CONFIG, useFactory: () => lerConfig() },
    { provide: UsuariosRepositorio, useClass: PrismaUsuariosRepositorio },
    // useFactory (e não useValue: new …): cada instância da aplicação tem o próprio estado
    { provide: TentativasLogin, useFactory: () => new TentativasLogin() },
    { provide: ListaNegra, useFactory: () => new ListaNegra() },
    { provide: LimiteRequisicoes, useFactory: () => new LimiteRequisicoes() },
    { provide: APP_GUARD, useClass: LimiteRequisicoesGuard },
    JwtAuthGuard,
  ],
  exports: [CONFIG, UsuariosRepositorio, ListaNegra, JwtAuthGuard],
})
export class AuthCompatModule {}
