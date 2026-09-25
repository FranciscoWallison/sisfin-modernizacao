import { Module } from '@nestjs/common';
import { CategoriasService } from './application/categorias.service';
import { CategoriasDespesaController, CategoriasReceitaController } from './http/categorias.controller';
import { CategoriasRepositorio } from './infra/categorias.repositorio';

@Module({
  controllers: [CategoriasReceitaController, CategoriasDespesaController],
  providers: [CategoriasService, CategoriasRepositorio],
})
export class CategoriasModule {}
