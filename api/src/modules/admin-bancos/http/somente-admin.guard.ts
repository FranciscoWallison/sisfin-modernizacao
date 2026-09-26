import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, UseGuards } from '@nestjs/common';
import type { RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import { JwtAuthGuard } from '../../../shared/auth-compat/jwt-auth.guard';

/**
 * `role = admin` → segue; qualquer outro usuário autenticado → 403, SEM executar nada (REQ-ADB-02). O papel vem do
 * usuário lido do banco a cada requisição pelo JwtAuthGuard (nunca do token): rebaixar um admin vale na hora.
 */
@Injectable()
export class SomenteAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const contexto = ctx.switchToHttp().getRequest<RequisicaoComContexto>().contexto;
    if (contexto?.usuario.role !== 'admin') throw new ForbiddenException({ message: 'Forbidden.' });
    return true;
  }
}

/** Rota de admin: token válido (401) + papel admin (403). Os guards rodam antes do upload (interceptor). */
export const SomenteAdmin = () => applyDecorators(UseGuards(JwtAuthGuard, SomenteAdminGuard));
