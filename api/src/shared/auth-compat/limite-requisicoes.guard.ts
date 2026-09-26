import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Config } from '../config/config';
import { CONFIG, RequisicaoComContexto } from './contexto';
import { LimiteRequisicoes } from './controles';
import { verificarToken } from './tokens';

/**
 * Rotas FORA do limite por IP: o webhook do Stripe se autentica pela assinatura (HMAC) e vem de poucos IPs do Stripe;
 * um pico de renovações viraria 429 e horas de reenvio com o cliente pagante bloqueado (revisão A07, S7).
 */
const ROTAS_SEM_LIMITE = new Set(['/api/hooks/stripe']);

/**
 * 60 req/min nas rotas /api (throttle:60,1 do legado — RN-AUT-002). Chave = usuário do token válido, senão IP.
 * Responde com X-RateLimit-Limit / X-RateLimit-Remaining e, ao estourar, 429 + Retry-After.
 */
@Injectable()
export class LimiteRequisicoesGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly limite: LimiteRequisicoes,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequisicaoComContexto>();
    // O Express roteia sem diferenciar maiúsculas: "/API/…" também é API (achado da revisão do código)
    const caminho = req.path.toLowerCase();
    if (!caminho.startsWith('/api/') || ROTAS_SEM_LIMITE.has(caminho.replace(/\/+$/, ''))) return true;
    const res = ctx.switchToHttp().getResponse<Response>();

    let chave = `ip:${req.ip}`;
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    // No login, sempre por IP: um Bearer válido do atacante não pode dar a ele um balde extra de tentativas
    if (token && caminho !== '/api/access_token') {
      try {
        chave = `usuario:${verificarToken(this.config.jwtSegredo, token, this.config.jwtEmissor).sub}`;
      } catch {
        /* token inválido: limita por IP; o JwtAuthGuard responde 401 depois */
      }
    }

    const r = this.limite.consumir(chave);
    res.setHeader('X-RateLimit-Limit', String(LimiteRequisicoes.LIMITE));
    res.setHeader('X-RateLimit-Remaining', String(r.restantes));
    if (!r.permitido) {
      res.setHeader('Retry-After', String(r.segundosParaReiniciar));
      throw new HttpException({ message: 'Too Many Attempts.' }, 429);
    }
    return true;
  }
}
