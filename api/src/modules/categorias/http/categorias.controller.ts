import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, Type } from '@nestjs/common';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { IdDaRotaPipe } from '../../../shared/http/id-da-rota.pipe';
import { dataCarbon } from '../../../shared/http/serializacao';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { CategoriasService } from '../application/categorias.service';
import { Categoria, NoDaArvore, TipoArvore, transformar } from '../domain/arvore';
import { CategoriaDto } from './categoria.dto';

// /api/category_revenues e /api/category_expenses — mesmo contrato (CategoriesControllerTrait no legado).
// Contrato: .specs/legado/modulos/categorias/contrato.md. 404 para categoria de outro cliente (REQ-CAT-03).

/**
 * CategoryTransformer do legado: depth + children recursivo (defaultIncludes = ['children']). Sem recursão na
 * montagem (S6): `transformar` percorre com pilha e preenche `children.data` depois, na ordem de id.
 */
export function serializarCategorias(nos: NoDaArvore<Categoria>[]): unknown[] {
  return transformar<Categoria, unknown>(nos, (no, filhos) => ({
    id: no.item.id,
    name: no.item.name,
    parent_id: no.item.parentId,
    depth: no.depth,
    created_at: dataCarbon(no.item.createdAt),
    updated_at: dataCarbon(no.item.updatedAt),
    children: { data: filhos },
  }));
}
const serializar = (no: NoDaArvore<Categoria>) => serializarCategorias([no])[0];

const entrada = (dto: CategoriaDto) => ({ name: dto.name, parentId: dto.parent_id ?? null }); // dto.id é descartado
const cliente = (req: RequisicaoComContexto) => req.contexto!.clienteId!;

export function criarCategoriasController(rota: 'category_revenues' | 'category_expenses', tipo: TipoArvore): Type<unknown> {
  @Controller(`api/${rota}`)
  class CategoriasController {
    constructor(readonly categorias: CategoriasService) {}

    @Get()
    @ComCliente()
    async listar() {
      return { data: serializarCategorias(await this.categorias.listar(tipo)) };
    }

    @Get(':id')
    @ComCliente()
    async obter(@Param('id', IdDaRotaPipe) id: number) {
      return { data: serializar(await this.categorias.obter(tipo, id)) };
    }

    @Post()
    @ComCliente()
    async criar(@Body() dto: CategoriaDto, @Req() req: RequisicaoComContexto) {
      return { data: serializar(await this.categorias.criar(tipo, entrada(dto), cliente(req))) };
    }

    @Put(':id')
    @ComCliente()
    async atualizar(@Param('id', IdDaRotaPipe) id: number, @Body() dto: CategoriaDto, @Req() req: RequisicaoComContexto) {
      return { data: serializar(await this.categorias.atualizar(tipo, id, entrada(dto), cliente(req))) };
    }

    @Delete(':id')
    @HttpCode(204)
    @ComCliente()
    async excluir(@Param('id', IdDaRotaPipe) id: number, @Req() req: RequisicaoComContexto) {
      await this.categorias.excluir(tipo, id, cliente(req));
    }
  }
  return CategoriasController;
}

export const CategoriasReceitaController = criarCategoriasController('category_revenues', 'receita');
export const CategoriasDespesaController = criarCategoriasController('category_expenses', 'despesa');
