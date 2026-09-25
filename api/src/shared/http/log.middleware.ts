import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Log estruturado por requisição (design §10): método, rota, status, cliente, usuário, duração.
 * NUNCA loga corpo, cabeçalhos nem query string (senha, token, Authorization — revisão de segurança #9).
 */
@Injectable()
export class LogMiddleware implements NestMiddleware {
  private readonly log = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      const contexto = (req as Request & { contexto?: { clienteId?: number; usuarioId?: number } }).contexto;
      this.log.log(
        JSON.stringify({
          metodo: req.method,
          rota: req.path,
          status: res.statusCode,
          cliente: contexto?.clienteId ?? null,
          usuario: contexto?.usuarioId ?? null,
          ms: Math.round(ms),
        }),
      );
    });
    next();
  }
}
