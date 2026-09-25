import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Req, UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { metaPaginacao, paginaDaQuery } from '../shared/http/paginacao';
import { dataCarbon, dinheiro } from '../shared/http/serializacao';
import { ComCliente } from '../shared/tenant/com-cliente';
import { LeituraRepositorio, Ordem } from './infra/leitura.repositorio';

// Fatias de LEITURA compatíveis (T08): só o que o módulo contas e a paridade usam. Formatos: contrato.md.
// Serão substituídas pelos módulos contas-bancarias, categorias e extrato quando forem migrados.

type ContaBancaria = { id: number; name: string; agency: string | null; account: string | null; balance: unknown; default: boolean; bankId: number; createdAt: Date | null; updatedAt: Date | null };
type Categoria = { id: number; name: string; parentId: number | null; lft: number; createdAt: Date | null; updatedAt: Date | null };

const contaBancaria = (c: ContaBancaria) => ({
  id: c.id,
  name: c.name,
  agency: c.agency,
  account: c.account,
  balance: dinheiro(c.balance as string),
  default: c.default,
  bank_id: c.bankId,
  created_at: dataCarbon(c.createdAt),
  updated_at: dataCarbon(c.updatedAt),
});

/** Árvore de categorias a partir das raízes (legado: FindRootCategoriesCriteria + include recursivo de children). */
function arvore(categorias: Categoria[]) {
  const filhos = new Map<number | null, Categoria[]>();
  for (const c of categorias) filhos.set(c.parentId, [...(filhos.get(c.parentId) ?? []), c]);
  const montar = (c: Categoria, profundidade: number): unknown => ({
    id: c.id,
    name: c.name,
    parent_id: c.parentId,
    depth: profundidade,
    created_at: dataCarbon(c.createdAt),
    updated_at: dataCarbon(c.updatedAt),
    children: { data: (filhos.get(c.id) ?? []).map((f) => montar(f, profundidade + 1)) },
  });
  return { data: (filhos.get(null) ?? []).map((c) => montar(c, 0)) };
}

function ordemDaQuery(orderBy: unknown, sortedBy: unknown): Ordem {
  const campo = (orderBy ?? 'id') as Ordem['campo'];
  const sentido = (sortedBy ?? 'asc') as Ordem['sentido'];
  const erros: Record<string, string[]> = {};
  if (!['id', 'value', 'balance', 'bank_account_id'].includes(campo)) erros.orderBy = ['The selected order by is invalid.'];
  if (!['asc', 'desc'].includes(sentido)) erros.sortedBy = ['The selected sorted by is invalid.'];
  if (Object.keys(erros).length) throw new UnprocessableEntityException(erros);
  return { campo, sentido };
}

const urlBase = (req: Request) => `${req.protocol}://${req.get('host')}${req.path}`;

@Controller('api')
export class LeituraController {
  constructor(private readonly repo: LeituraRepositorio) {}

  @Get('bank_accounts/lists')
  @ComCliente()
  listas() {
    return this.repo.listaContasBancarias();
  }

  @Get('bank_accounts')
  @ComCliente()
  async contasBancarias(@Query('page') page: unknown, @Req() req: Request) {
    const pagina = paginaDaQuery(page);
    const { total, itens } = await this.repo.contasBancarias(pagina);
    return { data: itens.map(contaBancaria), meta: metaPaginacao(total, itens.length, pagina, urlBase(req), req.query) };
  }

  @Get('bank_accounts/:id')
  @ComCliente()
  async contaBancaria(@Param('id', ParseIntPipe) id: number) {
    const c = await this.repo.contaBancaria(id);
    if (!c) throw new NotFoundException();
    return { data: contaBancaria(c) };
  }

  @Get('category_expenses')
  @ComCliente()
  async categoriasDespesa() {
    return arvore(await this.repo.categorias('despesa'));
  }

  @Get('category_revenues')
  @ComCliente()
  async categoriasReceita() {
    return arvore(await this.repo.categorias('receita'));
  }

  @Get('statements')
  @ComCliente()
  async extrato(@Query('page') page: unknown, @Query('orderBy') orderBy: unknown, @Query('sortedBy') sortedBy: unknown, @Req() req: Request) {
    const pagina = paginaDaQuery(page);
    const { total, itens, porTipo } = await this.repo.extrato(pagina, ordemDaQuery(orderBy, sortedBy));
    const tipo = (t: string) => porTipo.find((p) => p.statementableType === t);
    const receitas = tipo('BillReceive');
    const despesas = tipo('BillPay');
    return {
      data: {
        statements: {
          data: itens.map((s) => ({
            id: s.id,
            date: s.createdAt ? s.createdAt.toISOString().slice(0, 10) : null,
            value: dinheiro(s.value),
            balance: dinheiro(s.balance),
            bank_account_id: s.bankAccountId,
          })),
          meta: metaPaginacao(total, itens.length, pagina, urlBase(req), req.query),
        },
        statement_data: {
          count: (receitas?._count._all ?? 0) + (despesas?._count._all ?? 0),
          revenues: { total: dinheiro(receitas?._sum.value ?? 0) },
          expenses: { total: dinheiro(despesas?._sum.value ?? 0) },
        },
      },
    };
  }
}
