import { Controller, Get, Inject, NotFoundException, Param, Query, Req, UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { CONFIG } from '../shared/auth-compat/contexto';
import type { Config } from '../shared/config/config';
import { IdDaRotaPipe } from '../shared/http/id-da-rota.pipe';
import { limiteDaQuery, metaPaginacao, paginaDaQuery } from '../shared/http/paginacao';
import { contaBancaria, ContaBancariaLida, dinheiro } from '../shared/http/serializacao';
import { ComCliente } from '../shared/tenant/com-cliente';
import { LeituraRepositorio, ORDEM_CONTA_BANCARIA, ORDEM_EXTRATO, Sentido } from './infra/leitura.repositorio';

// Fatias de LEITURA compatíveis (T08): o que o módulo contas, a paridade e o SPA usam. As categorias saíram
// daqui para o módulo `categorias` (G04).
// Formatos: contrato.md + trafego-spa.md (parâmetros reais do SPA). Serão substituídas pelos módulos
// contas-bancarias, categorias e extrato quando forem migrados.

type ContaBancaria = ContaBancariaLida;

// Links de paginação usam o host da requisição, como o legado; o logo dos bancos NÃO (ASSETS_URL — REQ-CBA-07)
const urlBase = (req: Request) => `${req.protocol}://${req.get('host')}${req.path}`;
const inclui = (req: Request, nome: string) => String(req.query.include ?? '').split(',').includes(nome);

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
  constructor(
    private readonly repo: LeituraRepositorio,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

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
      data: itens.map((c) => contaBancaria(c as ContaBancaria, this.config.urlArquivos)),
      meta: metaPaginacao(total, itens.length, pagina.pagina, urlBase(req), req.query, pagina.limite),
    };
  }

  @Get('bank_accounts/:id')
  @ComCliente()
  async contaBancaria(@Param('id', IdDaRotaPipe) id: number, @Req() req: Request) {
    // include=bank: a tela de edição lê response.data.data.bank.data (BankAccountUpdate.vue) — B06
    const c = await this.repo.contaBancaria(id, inclui(req, 'bank'));
    if (!c) throw new NotFoundException();
    return { data: contaBancaria(c, this.config.urlArquivos) };
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
