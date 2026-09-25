import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { metaPaginacao, paginaDaQuery } from '../../../shared/http/paginacao';
import { contaBancaria, ContaBancariaLida, dinheiro } from '../../../shared/http/serializacao';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { ExtratoService } from '../application/extrato.service';
import { POR_PAGINA } from '../domain/consulta';

// GET /api/statements — contrato: .specs/legado/modulos/extrato/contrato.md (mesmo formato que o compat servia).
// ?limit é ignorado (REQ-EXT-04): 15 por página.

const inclui = (req: Request, nome: string) => String(req.query.include ?? '').split(',').includes(nome);
const urlBase = (req: Request) => `${req.protocol}://${req.get('host')}${req.path}`;

@Controller('api')
export class ExtratoController {
  constructor(private readonly extrato: ExtratoService) {}

  @Get('statements')
  @ComCliente()
  async listar(@Query('page') page: unknown, @Req() req: RequisicaoComContexto & Request) {
    const pagina = paginaDaQuery(page);
    const { total, itens, porTipo } = await this.extrato.listar(req.contexto!.clienteId!, {
      pagina,
      orderBy: req.query.orderBy,
      sortedBy: req.query.sortedBy,
      search: req.query.search,
      comConta: inclui(req, 'bankAccount'),
    });
    const tipo = (t: string) => porTipo.find((p) => p.statementableType === t);
    const receitas = tipo('BillReceive');
    const despesas = tipo('BillPay');
    return {
      data: {
        statements: {
          data: itens.map((s) => ({
            id: s.id,
            date: s.createdAt ? s.createdAt.toISOString().slice(0, 10) : null, // dia do LANÇAMENTO (RN-EXT-001)
            value: dinheiro(s.value),
            balance: dinheiro(s.balance),
            bank_account_id: s.bankAccountId,
            ...('bankAccount' in s && s.bankAccount ? { bankAccount: { data: contaBancaria(s.bankAccount as ContaBancariaLida) } } : {}),
          })),
          meta: metaPaginacao(total, itens.length, pagina, urlBase(req), req.query, POR_PAGINA),
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
