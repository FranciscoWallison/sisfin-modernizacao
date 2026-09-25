import type { Request } from 'express';
import type { UsuarioAuth } from './usuarios.repositorio';

/** Dados da requisição autenticada. `clienteId` é resolvido pelo `sub` no banco — nunca vem do token (design §4). */
export interface ContextoRequisicao {
  usuarioId: number;
  clienteId: number | null;
  jti: string;
  exp: number;
  usuario: UsuarioAuth;
}

export type RequisicaoComContexto = Request & { contexto?: ContextoRequisicao };

export const CONFIG = Symbol('CONFIG');
