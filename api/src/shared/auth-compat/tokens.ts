import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

// JWT compatível com o legado (RN-AUT-003): HS256, 60 min, claims iss/iat/exp/nbf/jti/sub + user{id,name,email}.
// A claim "user" (nome e e-mail em claro) é risco aceito no ADR-005 enquanto o SPA depender dela.
export const TTL_SEGUNDOS = 3600;
const ALGORITMO = 'HS256' as const;

export interface ClaimsToken {
  sub: number;
  jti: string;
  exp: number;
  iat: number;
  nbf: number;
}

export function emitirToken(
  segredo: string,
  usuario: { id: number; name: string; email: string },
  emissor: string,
  agora = Math.floor(Date.now() / 1000),
): string {
  return jwt.sign(
    {
      iss: emissor,
      iat: agora,
      nbf: agora,
      exp: agora + TTL_SEGUNDOS,
      jti: randomBytes(12).toString('base64url'),
      sub: usuario.id,
      user: { id: usuario.id, name: usuario.name, email: usuario.email },
    },
    segredo,
    // sem noTimestamp: essa opção APAGA o iat do payload (e o próprio verificarToken exige iat)
    { algorithm: ALGORITMO },
  );
}

/** Verifica assinatura (só HS256), validade e presença das claims obrigatórias. Lança em qualquer problema. */
export function verificarToken(segredo: string, token: string): ClaimsToken {
  const dados = jwt.verify(token, segredo, { algorithms: [ALGORITMO], clockTolerance: 5 });
  if (typeof dados === 'string') throw new Error('payload inválido');
  const { sub, jti, exp, iat, nbf } = dados as Record<string, unknown>;
  if (typeof sub !== 'number' || typeof jti !== 'string' || typeof exp !== 'number' || typeof iat !== 'number' || typeof nbf !== 'number') {
    throw new Error('claims obrigatórias ausentes');
  }
  return { sub, jti, exp, iat, nbf };
}
