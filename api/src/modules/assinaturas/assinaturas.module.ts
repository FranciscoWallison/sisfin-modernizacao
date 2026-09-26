import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../../shared/auth-compat/contexto';
import type { Config } from '../../shared/config/config';
import { VerificadorDeAssinatura } from '../../shared/tenant/assinatura.guard';
import { AssinaturasService } from './application/assinaturas.service';
import { GatewayDePagamento } from './application/gateway-de-pagamento';
import { AssinaturasController } from './http/assinaturas.controller';
import { WebhookController } from './http/webhook.controller';
import { AssinaturasRepositorio } from './infra/assinaturas.repositorio';
import { SimuladorGateway } from './infra/simulador.gateway';
import { StripeGateway } from './infra/stripe.gateway';

// Global: o gate de assinatura (ComCliente, em todos os módulos) precisa do VerificadorDeAssinatura.
@Global()
@Module({
  controllers: [AssinaturasController, WebhookController],
  providers: [
    AssinaturasRepositorio,
    AssinaturasService,
    {
      provide: GatewayDePagamento,
      useFactory: (config: Config) => (config.pagamentos === 'stripe' ? new StripeGateway(config) : new SimuladorGateway(config)),
      inject: [CONFIG],
    },
    { provide: VerificadorDeAssinatura, useExisting: AssinaturasService },
  ],
  exports: [VerificadorDeAssinatura],
})
export class AssinaturasModule {}
