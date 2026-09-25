import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CONFIG } from '../../../shared/auth-compat/contexto';
import { LimiteRequisicoes } from '../../../shared/auth-compat/controles';
import type { Config } from '../../../shared/config/config';

const UMA_HORA_MS = 3_600_000;

/**
 * Balde PRÓPRIO do cadastro público (revisão de segurança do site, S3): o limite geral de /api (60/min por IP)
 * deixava criar ~86 mil contas por dia por IP — lixo no banco, baldes novos por conta, bcrypt no event loop e
 * enumeração de e-mails pelo "already taken". Padrão: 5 cadastros por IP por hora (CADASTROS_POR_HORA).
 * Conta toda requisição à rota, inclusive as inválidas (a enumeração usa corpos válidos).
 */
@Injectable()
export class LimiteCadastroGuard implements CanActivate {
  private readonly limite: LimiteRequisicoes;

  constructor(@Inject(CONFIG) config: Config) {
    this.limite = new LimiteRequisicoes(Date.now, config.cadastrosPorHora, UMA_HORA_MS);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const r = this.limite.consumir(`ip:${req.ip}`);
    if (!r.permitido) {
      res.setHeader('Retry-After', String(r.segundosParaReiniciar));
      throw new HttpException({ message: 'Too Many Attempts.' }, 429);
    }
    return true;
  }
}
