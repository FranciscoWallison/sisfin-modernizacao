import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { JwtAuthGuard } from '../../../shared/auth-compat/jwt-auth.guard';
import { dinheiro } from '../../../shared/http/serializacao';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { AssinaturasService } from '../application/assinaturas.service';

// Rotas da assinatura (REQ-ASS-01, 02, 04). Livres do gate (`semAssinatura`): quem não assinou precisa conseguir assinar.

const plano = (p: { id: number; name: string; description: string; value: { toString(): string } }) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  value: dinheiro(p.value),
});
const cliente = (req: RequisicaoComContexto) => req.contexto!.clienteId!;

@Controller('api')
export class AssinaturasController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  async planos() {
    return { data: (await this.assinaturas.planos()).map(plano) };
  }

  @Get('subscription')
  @ComCliente({ semAssinatura: true })
  async estado() {
    const a = await this.assinaturas.estado();
    return {
      data: {
        status: a.status,
        current_period_end: a.currentPeriodEnd?.toISOString() ?? null,
        cancel_at_period_end: a.cancelAtPeriodEnd,
        canceled_at: a.canceledAt?.toISOString() ?? null,
        plan: a.plan ? plano(a.plan) : null,
      },
    };
  }

  @Post('subscriptions/checkout')
  @HttpCode(200)
  @ComCliente({ semAssinatura: true })
  async checkout(@Req() req: RequisicaoComContexto) {
    return { url: await this.assinaturas.checkout(cliente(req)) };
  }

  @Post('subscriptions/portal')
  @HttpCode(200)
  @ComCliente({ semAssinatura: true })
  async portal(@Req() req: RequisicaoComContexto) {
    return { url: await this.assinaturas.portal(cliente(req)) };
  }
}
