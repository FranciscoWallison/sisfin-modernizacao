import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Config } from '../config/config';
import { CONFIG, RequisicaoComContexto } from './contexto';
import { ListaNegra } from './controles';
import { verificarToken } from './tokens';
import { UsuariosRepositorio } from './usuarios.repositorio';

export const naoAutenticado = () => new UnauthorizedException({ error: 'Unauthenticated.' });

/** Autentica pelo Bearer: assinatura HS256, claims, blacklist e usuário existente (design §8). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly listaNegra: ListaNegra,
    private readonly usuarios: UsuariosRepositorio,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequisicaoComContexto>();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw naoAutenticado();

    let claims;
    try {
      claims = verificarToken(this.config.jwtSegredo, token, this.config.jwtEmissor);
    } catch {
      throw naoAutenticado();
    }
    if (this.listaNegra.contem(claims.jti)) throw naoAutenticado();

    const usuario = await this.usuarios.porId(claims.sub);
    if (!usuario) throw naoAutenticado(); // usuário apagado depois de emitir o token

    req.contexto = { usuarioId: usuario.id, clienteId: usuario.clientId, jti: claims.jti, exp: claims.exp, usuario };
    return true;
  }
}
