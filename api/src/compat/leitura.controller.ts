import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Req, UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { limiteDaQuery, metaPaginacao, paginaDaQuery } from '../shared/http/paginacao';
import { dataCarbon, dinheiro } from '../shared/http/serializacao';
import { ComCliente } from '../shared/tenant/com-cliente';
import { LeituraRepositorio, ORDEM_CONTA_BANCARIA, ORDEM_EXTRATO, Sentido } from './infra/leitura.repositorio';

// Fatias de LEITURA compatíveis (T08): o que o módulo contas, a paridade e o SPA usam.
// Formatos: contrato.md + trafego-spa.md (parâmetros reais do SPA). Serão substituídas pelos módulos
// contas-bancarias, categorias e extrato quando forem migrados.

type Banco = { id: number; name: string; logo: string; createdAt: Date | null; updatedAt: Date | null };
type ContaBancaria = {
  id: number; name: string; agency: string | null; account: string | null; balance: unknown; default: boolean;
  bankId: number; createdAt: Date | null; updatedAt: Date | null; bank?: Banco;
};
type Categoria = { id: number; name: string; parentId: number | null; lft: number; createdAt: Date | null; updatedAt: Date | null };

const hostDe = (req: Request) => `${req.protocol}://${req.get('host')}`;
const urlBase = (req: Request) => `${hostDe(req)}${req.path}`;
const inclui = (req: Request, nome: string) => String(req.query.include ?? '').split(',').includes(nome);

// legado (BankTransformer::makeLogoPath): "<url('/')>/storage/banks/imagens/<arquivo>"
const banco = (b: Banco, host: string) => ({
  id: b.id,
  name: b.name,
  logo: `${host}/storage/banks/imagens/${b.logo}`,
  created_at: dataCarbon(b.createdAt),
  updated_at: dataCarbon(b.updatedAt),
});

const contaBancaria = (c: ContaBancaria, host?: string) => ({
  id: c.id,
  name: c.name,
  agency: c.agency,
  account: c.account,
  balance: dinheiro(c.balance as string),
  default: c.default,
  bank_id: c.bankId,
  created_at: dataCarbon(c.createdAt),
  updated_at: dataCarbon(c.updatedAt),
  ...(c.bank && host ? { bank: { data: banco(c.bank, host) } } : {}),
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

/** orderBy/sortedBy por allowlist (design §7): fora dela → 422, nunca vira nome de coluna. */
function ordemDaQuery<T extends string>(req: Request, permitidos: readonly T[]): { campo: T; sentido: Sentido } {
  const campo = String(req.query.orderBy ?? 'id') as T;
  const sentido = String(req.query.sortedBy ?? 'asc') as Sentido;
  const erros: Record<string, string[]> = {};
  if (!permitidos.includes(campo)) erros.orderBy = ['The selected order by is invalid.'];
  if (!['asc', 'desc'].includes(sentido)) erros.sortedBy = ['The selected sorted by is invalid.'];
  if (Object.keys(erros).length) throw new UnprocessableEntityException(erros);
  return { campo, sentido };
}

const buscaDaQuery = (valor: unknown) => (typeof valor === 'string' ? valor.trim().slice(0, 100) : '');

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
  async contasBancarias(@Query('page') page: unknown, @Query('limit') limit: unknown, @Query('search') search: unknown, @Req() req: Request) {
    const pagina = { pagina: paginaDaQuery(page), limite: limiteDaQuery(limit) };
    const ordem = ordemDaQuery(req, Object.keys(ORDEM_CONTA_BANCARIA) as (keyof typeof ORDEM_CONTA_BANCARIA)[]);
    const { total, itens } = await this.repo.contasBancarias(pagina, ordem, buscaDaQuery(search), inclui(req, 'bank'));
    return {
      data: itens.map((c) => contaBancaria(c as ContaBancaria, hostDe(req))),
      meta: metaPaginacao(total, itens.length, pagina.pagina, urlBase(req), req.query, pagina.limite),
    };
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
  async extrato(@Query('page') page: unknown, @Query('limit') limit: unknown, @Req() req: Request) {
    const pagina = { pagina: paginaDaQuery(page), limite: limiteDaQuery(limit) };
    const ordem = ordemDaQuery(req, Object.keys(ORDEM_EXTRATO) as (keyof typeof ORDEM_EXTRATO)[]);
    const { total, itens, porTipo } = await this.repo.extrato(pagina, ordem, inclui(req, 'bankAccount'));
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
            ...('bankAccount' in s && s.bankAccount ? { bankAccount: { data: contaBancaria(s.bankAccount as ContaBancaria) } } : {}),
          })),
          meta: metaPaginacao(total, itens.length, pagina.pagina, urlBase(req), req.query, pagina.limite),
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
