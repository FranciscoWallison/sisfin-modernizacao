import {
  applyDecorators,
  CallHandler,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RequisicaoComContexto } from '../auth-compat/contexto';
import { JwtAuthGuard } from '../auth-compat/jwt-auth.guard';
import { AssinaturaGuard } from './assinatura.guard';
import { ContextoCliente } from './contexto-cliente';

/** Usuário autenticado SEM cliente → 403 determinístico (RN-CON-019 → REQ-CON-13; legado respondia 500). */
@Injectable()
export class ClienteObrigatorioGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const contexto = ctx.switchToHttp().getRequest<RequisicaoComContexto>().contexto;
    if (!contexto || contexto.clienteId === null) throw new ForbiddenException({ message: 'Forbidden.' });
    return true;
  }
}

/** Executa o handler dentro do contexto do cliente (AsyncLocalStorage) — a extensão de tenant lê daqui. */
@Injectable()
export class ClienteInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { clienteId, usuarioId } = ctx.switchToHttp().getRequest<RequisicaoComContexto>().contexto!;
    return new Observable((assinante) =>
      ContextoCliente.executar({ clienteId: clienteId!, usuarioId }, () => next.handle().subscribe(assinante)),
    );
  }
}

/**
 * Rota autenticada e restrita ao cliente do usuário (cliente resolvido pelo `sub` no banco, nunca do token). Passa
 * também pelo gate de assinatura (desligado por padrão — REQ-ASS-05), exceto as rotas da própria assinatura
 * (`semAssinatura`), senão quem não assinou não conseguiria assinar.
 */
export const ComCliente = (opcoes: { semAssinatura?: boolean } = {}) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, ClienteObrigatorioGuard, ...(opcoes.semAssinatura ? [] : [AssinaturaGuard])),
    UseInterceptors(ClienteInterceptor),
  );
