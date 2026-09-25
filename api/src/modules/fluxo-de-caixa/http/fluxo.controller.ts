import { Controller, Get, Query, Req, UnprocessableEntityException } from '@nestjs/common';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { FluxoService } from '../application/fluxo.service';
import { MesInvalidoError } from '../domain/janela';
import type { CategoriaPeriodos, Periodo } from '../domain/montagem';

// /api/cash_flows e /api/cash_flows/monthly — contrato: .specs/legado/modulos/fluxo-de-caixa/contrato.md.
// Valores chegam em centavos do domínio e saem como número JSON (como o legado).

const reais = (centavos: number) => centavos / 100;
const periodos = (lista: Periodo[]) =>
  lista.map((p) => ({ period: p.period, revenues: { total: reais(p.revenues.total) }, expenses: { total: reais(p.expenses.total) } }));
const categorias = (lista: CategoriaPeriodos[]) =>
  lista.map((c) => ({ id: c.id, name: c.name, periods: c.periods.map((p) => ({ total: reais(p.total), period: p.period })) }));

@Controller('api/cash_flows')
export class FluxoController {
  constructor(private readonly fluxo: FluxoService) {}

  @Get('monthly')
  @ComCliente()
  async diario(@Req() req: RequisicaoComContexto) {
    const r = await this.fluxo.diario(req.contexto!.clienteId!);
    return { period_list: periodos(r.period_list) };
  }

  @Get()
  @ComCliente()
  async mensal(@Query('start') start: unknown, @Req() req: RequisicaoComContexto) {
    if (start !== undefined && typeof start !== 'string') {
      throw new UnprocessableEntityException({ start: ['The start must be a month in the format YYYY-MM.'] });
    }
    try {
      const r = await this.fluxo.mensal(req.contexto!.clienteId!, start);
      return {
        period_list: periodos(r.period_list),
        balance_before_first_month: reais(r.balance_before_first_month),
        categories_period: {
          expenses: { data: categorias(r.categories_period.expenses.data) },
          revenues: { data: categorias(r.categories_period.revenues.data) },
        },
      };
    } catch (e) {
      if (e instanceof MesInvalidoError) {
        throw new UnprocessableEntityException({ start: ['The start must be a month in the format YYYY-MM.'] });
      }
      throw e;
    }
  }
}
