import { BadRequestException, Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AssinaturasService } from '../application/assinaturas.service';
import { AssinaturaDoEventoInvalida } from '../application/gateway-de-pagamento';

/**
 * POST /api/hooks/stripe (REQ-ASS-03): sem JWT — quem autentica é a assinatura `Stripe-Signature`, verificada sobre o
 * corpo CRU (`rawBody: true` na criação da aplicação). O webhook da Iugu (público no legado) não existe mais.
 */
@Controller('api/hooks')
export class WebhookController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') assinatura?: string) {
    if (!req.rawBody) throw new BadRequestException({ message: 'Invalid signature.' });
    try {
      await this.assinaturas.receberEvento(req.rawBody, assinatura);
    } catch (e) {
      if (e instanceof AssinaturaDoEventoInvalida) throw new BadRequestException({ message: 'Invalid signature.' });
      throw e;
    }
    return { received: true };
  }
}
