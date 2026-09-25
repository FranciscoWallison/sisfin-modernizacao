// Configuração lida e VALIDADA no boot: a API não sobe com configuração insegura (design §8, §10; REQ-CON-13).
export interface Config {
  ambiente: string;
  porta: number;
  jwtSegredo: string;
  jwtEmissor: string;
  debugSql: boolean;
  origensCors: string[];
}

export class ConfigInvalidaError extends Error {}

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ambiente = env.NODE_ENV ?? 'development';
  const jwtSegredo = env.JWT_SECRET ?? '';
  if (Buffer.byteLength(jwtSegredo, 'utf8') < 32) {
    throw new ConfigInvalidaError('JWT_SECRET ausente ou com menos de 32 bytes: a API não sobe sem um segredo forte.');
  }
  // Segredo de exemplo/desenvolvimento versionado no repositório nunca vale em produção (revisão do código)
  if (ambiente === 'production' && /nao-usar-em-producao|desenvolvimento|change-?me|exemplo|example/i.test(jwtSegredo)) {
    throw new ConfigInvalidaError('JWT_SECRET é um segredo de exemplo/desenvolvimento: em produção use um segredo próprio.');
  }
  const debugSql = env.DEBUG_SQL === '1';
  if (debugSql && ambiente !== 'development') {
    throw new ConfigInvalidaError('DEBUG_SQL=1 só é permitido com NODE_ENV=development (o log de SQL expõe parâmetros).');
  }
  return {
    ambiente,
    porta: Number(env.PORT ?? 3000),
    jwtSegredo,
    // iss fixo pela configuração (antes vinha do cabeçalho Host, controlado pelo cliente) e verificado no token
    jwtEmissor: env.JWT_ISSUER ?? 'sisfin-api',
    debugSql,
    origensCors: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  };
}
