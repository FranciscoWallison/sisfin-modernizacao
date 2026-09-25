import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req, Type, UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { limiteDaQuery, metaPaginacao, paginaDaQuery } from '../../../shared/http/paginacao';
import { dataCarbon, dataSimples, dinheiro } from '../../../shared/http/serializacao';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { Contexto, ContasService } from '../application/contas.service';
import type { TipoConta } from '../domain/movimentos';
import { ContaDto } from './conta.dto';

// /api/bill_pays e /api/bill_receives — mesma estrutura (BillControllerTrait no legado). Contrato: contrato.md +
// trafego-spa.md. Corpo 422 em formato Laravel; 404 para conta de outro cliente (REQ-CON-07).

type Conta = {
  id: number; dateDue: Date; name: string; value: unknown; done: boolean; categoryId: number; bankAccountId: number;
  createdAt: Date | null; updatedAt: Date | null;
  category?: { id: number; name: string; parentId: number | null; createdAt: Date | null; updatedAt: Date | null } | null;
  bankAccount?: {
    id: number; name: string; agency: string | null; account: string | null; balance: unknown; default: boolean;
    bankId: number; createdAt: Date | null; updatedAt: Date | null;
  } | null;
};

function serializar(c: Conta) {
  return {
    id: c.id,
    date_due: dataSimples(c.dateDue),
    name: c.name,
    value: dinheiro(c.value as string),
    done: c.done,
    category_id: c.categoryId,
    bank_account_id: c.bankAccountId,
    created_at: dataCarbon(c.createdAt),
    updated_at: dataCarbon(c.updatedAt),
    // include=category: CategoryTransformer SEM children e sem withDepth → depth null (capturado do legado)
    ...(c.category !== undefined && c.category !== null
      ? { category: { data: { id: c.category.id, name: c.category.name, parent_id: c.category.parentId, depth: null, created_at: dataCarbon(c.category.createdAt), updated_at: dataCarbon(c.category.updatedAt) } } }
      : {}),
    ...(c.bankAccount
      ? { bankAccount: { data: { id: c.bankAccount.id, name: c.bankAccount.name, agency: c.bankAccount.agency, account: c.bankAccount.account, balance: dinheiro(c.bankAccount.balance as string), default: c.bankAccount.default, bank_id: c.bankAccount.bankId, created_at: dataCarbon(c.bankAccount.createdAt), updated_at: dataCarbon(c.bankAccount.updatedAt) } } }
      : {}),
  };
}

const ORDEM = { id: 'id', name: 'name', date_due: 'dateDue', value: 'value', done: 'done' } as const;
const inclui = (req: Request, nome: string) => String(req.query.include ?? '').split(',').includes(nome);
const contexto = (req: RequisicaoComContexto): Contexto => ({ clienteId: req.contexto!.clienteId!, usuarioId: req.contexto!.usuarioId });
const dados = (dto: ContaDto) => ({
  name: dto.name, dateDue: dto.date_due, value: dto.value, done: dto.done ?? false,
  categoryId: dto.category_id, bankAccountId: dto.bank_account_id,
});

function ordem(req: Request) {
  const campo = String(req.query.orderBy ?? 'id');
  const sentido = String(req.query.sortedBy ?? 'asc');
  const erros: Record<string, string[]> = {};
  // hasOwn, não "in": "in" olha o protótipo e deixava passar orderBy=constructor/toString (→ 500)
  if (!Object.hasOwn(ORDEM, campo)) erros.orderBy = ['The selected order by is invalid.'];
  if (!['asc', 'desc'].includes(sentido)) erros.sortedBy = ['The selected sorted by is invalid.'];
  if (Object.keys(erros).length) throw new UnprocessableEntityException(erros);
  return { campo: ORDEM[campo as keyof typeof ORDEM], sentido: sentido as 'asc' | 'desc' };
}

export function criarContasController(rota: 'bill_pays' | 'bill_receives', tipo: TipoConta): Type<unknown> {
  @Controller(`api/${rota}`)
  class ContasController {
    constructor(readonly contas: ContasService) {}

    @Get('total_today')
    @ComCliente()
    async totalHoje() {
      return { total: dinheiro(await this.contas.totalHoje(tipo)) };
    }

    @Get('total_rest_of_month')
    @ComCliente()
    async totalRestoDoMes() {
      return { total: dinheiro(await this.contas.totalRestoDoMes(tipo)) };
    }

    @Get()
    @ComCliente()
    async listar(@Query('page') page: unknown, @Query('limit') limit: unknown, @Req() req: Request) {
      const pagina = paginaDaQuery(page);
      const limite = limiteDaQuery(limit);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const r = await this.contas.listar(tipo, search, pagina, limite, ordem(req), inclui(req, 'category'), inclui(req, 'bankAccount'));
      const url = `${req.protocol}://${req.get('host')}${req.path}`;
      return {
        data: {
          bills: { data: (r.itens as Conta[]).map(serializar), meta: metaPaginacao(r.total, r.itens.length, pagina, url, req.query, limite) },
          bill_data: { total_paid: dinheiro(r.totais.pago), total_to_pay: dinheiro(r.totais.aPagar), total_expired: dinheiro(r.totais.vencido) },
        },
      };
    }

    @Get(':id')
    @ComCliente()
    async obter(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
      return { data: serializar((await this.contas.obter(tipo, id, inclui(req, 'category'), inclui(req, 'bankAccount'))) as Conta) };
    }

    @Post()
    @ComCliente()
    async criar(@Body() dto: ContaDto, @Req() req: RequisicaoComContexto) {
      const conta = await this.contas.criar(tipo, { ...dados(dto), repeat: dto.repeat, repeatNumber: dto.repeat_number, repeatType: dto.repeat_type }, contexto(req));
      return { data: serializar(conta as Conta) };
    }

    @Put(':id')
    @ComCliente()
    async atualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ContaDto, @Req() req: RequisicaoComContexto) {
      return { data: serializar((await this.contas.atualizar(tipo, id, dados(dto), contexto(req))) as Conta) };
    }

    @Delete(':id')
    @HttpCode(204)
    @ComCliente()
    async excluir(@Param('id', ParseIntPipe) id: number, @Req() req: RequisicaoComContexto) {
      await this.contas.excluir(tipo, id, contexto(req));
    }
  }
  return ContasController;
}

export const ContasAPagarController = criarContasController('bill_pays', 'pagar');
export const ContasAReceberController = criarContasController('bill_receives', 'receber');
