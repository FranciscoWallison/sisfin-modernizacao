import { Module } from '@nestjs/common';
import { CadastroService } from './application/cadastro.service';
import { CadastroController } from './http/cadastro.controller';
import { LimiteCadastroGuard } from './http/limite-cadastro.guard';
import { CadastroRepositorio } from './infra/cadastro.repositorio';

@Module({ controllers: [CadastroController], providers: [CadastroService, CadastroRepositorio, LimiteCadastroGuard] })
export class CadastroModule {}
