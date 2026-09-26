import { CanActivate, ExecutionContext, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { CONFIG, RequisicaoComContexto } from '../auth-compat/contexto';
import type { Config } from '../config/config';

/**
 * Porta do gate de assinatura (REQ-ASS-05): o `ComCliente` vive em shared/ e não pode depender do módulo de
 * assinaturas, que a implementa (e a exporta como global).
 */
export abstract class VerificadorDeAssinatura {
  abstract acesso(clienteId: number): Promise<'liberado' | 'sem_assinatura' | 'expirada'>;
}

/**
 * Gate com os corpos do CheckSubscription do legado (RN-ASS-006). Desligado por padrão (`EXIGIR_ASSINATURA`): ligar
 * bloqueia todo cliente sem assinatura. O app antigo (Vue 1) desloga ao receber qualquer `error` com "subscription".
 */
@Injectable()
export class AssinaturaGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly verificador?: VerificadorDeAssinatura,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.config.exigirAssinatura) return true;
    if (!this.verificador) throw new Error('EXIGIR_ASSINATURA ligado sem o módulo de assinaturas');
    const { clienteId } = ctx.switchToHttp().getRequest<RequisicaoComContexto>().contexto!;
    const acesso = await this.verificador.acesso(clienteId!);
    if (acesso === 'sem_assinatura') {
      throw new HttpException({ error: 'subscription_not_found', message: 'Cliente sem assinatura contratada.' }, 400);
    }
    if (acesso === 'expirada') throw new HttpException({ error: 'subscription_expired', message: 'Assinatura expirada.' }, 403);
    return true;
  }
}
