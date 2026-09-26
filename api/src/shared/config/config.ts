import { isAbsolute } from 'node:path';

// Configuração lida e VALIDADA no boot: a API não sobe com configuração insegura (design §8, §10; REQ-CON-13).
export interface Config {
  ambiente: string;
  porta: number;
  jwtSegredo: string;
  jwtEmissor: string;
  debugSql: boolean;
  origensCors: string[];
  /** Base dos links de arquivos (logo dos bancos) — REQ-CBA-07: da configuração, nunca do cabeçalho Host. */
  urlArquivos: string;
  /** Cadastros públicos por IP por hora (revisão de segurança do site, S3). Padrão 5; o compose local usa mais. */
  cadastrosPorHora: number;
  /** Diretório dos arquivos enviados (logos dos bancos em banks/imagens) — ADR-010. Caminho absoluto. */
  arquivosDir: string;
  /** Provedor de pagamento (ADR-011): o Stripe, ou o simulador (testes, CI e E2E — sem rede nem chave). */
  pagamentos: 'stripe' | 'simulador';
  stripeSecretKey: string | null;
  /** Segredo de assinatura do webhook. No simulador, um valor só local (não é chave do Stripe). */
  stripeWebhookSecret: string;
  stripePriceId: string | null;
  /** Origem do site (volta do Checkout e do portal) — da configuração, nunca do cabeçalho Host. */
  siteUrl: string;
  /** Gate de assinatura (REQ-ASS-05). Desligado por padrão: ligar bloqueia todo cliente sem assinatura. */
  exigirAssinatura: boolean;
}

export class ConfigInvalidaError extends Error {}

/** Segredo de webhook do SIMULADOR em desenvolvimento: público de propósito, recusado em produção. */
export const WEBHOOK_SECRET_DO_SIMULADOR = 'whsec_simulador_local_nao_usar_em_producao';

/**
 * Ambientes em que o SIMULADOR pode rodar — lista FECHADA (revisão A07, S5): o segredo dele é público e os ids são
 * previsíveis, então qualquer um forjaria eventos. "Qualquer coisa que não seja production" (staging, prod, sem
 * NODE_ENV no servidor…) cairia nele.
 */
const AMBIENTES_DO_SIMULADOR = new Set(['development', 'test']);

function lerPagamentos(env: NodeJS.ProcessEnv, ambiente: string) {
  const producao = ambiente === 'production';
  const local = AMBIENTES_DO_SIMULADOR.has(ambiente);
  const pagamentos = env.PAGAMENTOS ?? (local ? 'simulador' : '');
  if (pagamentos !== 'stripe' && pagamentos !== 'simulador') {
    throw new ConfigInvalidaError('PAGAMENTOS inválido: use "stripe" (ou "simulador", só em development/test).');
  }
  if (!local && pagamentos !== 'stripe') {
    throw new ConfigInvalidaError(`Em ${ambiente} PAGAMENTOS precisa ser "stripe": o simulador (segredo público) é só de development/test.`);
  }
  const stripe = pagamentos === 'stripe';
  const chave = env.STRIPE_SECRET_KEY ?? null;
  const preco = env.STRIPE_PRICE_ID ?? null;
  const webhook = env.STRIPE_WEBHOOK_SECRET ?? (stripe ? '' : WEBHOOK_SECRET_DO_SIMULADOR);
  if (stripe && !/^(sk|rk)_(test|live)_\w+$/.test(chave ?? '')) {
    throw new ConfigInvalidaError('STRIPE_SECRET_KEY ausente ou inválida (sk_test_…/sk_live_… ou rk_…): nunca a chave publicável.');
  }
  // Chave de TESTE em produção: o cartão 4242 do Stripe liberaria o app de graça (revisão A07, S6)
  if (producao && !/^(sk|rk)_live_/.test(chave ?? '')) {
    throw new ConfigInvalidaError('Em produção STRIPE_SECRET_KEY precisa ser de modo live (sk_live_… ou rk_live_…).');
  }
  if (stripe && !/^price_\w+$/.test(preco ?? '')) {
    throw new ConfigInvalidaError('STRIPE_PRICE_ID ausente ou inválido (price_…): o preço recorrente do plano no Stripe.');
  }
  if (!/^whsec_\w+$/.test(webhook) || (!local && webhook === WEBHOOK_SECRET_DO_SIMULADOR)) {
    throw new ConfigInvalidaError('STRIPE_WEBHOOK_SECRET ausente ou inválido (whsec_…).');
  }
  const siteUrl = (env.SITE_URL ?? (local ? 'http://localhost:8083' : '')).replace(/\/+$/, '');
  if (!(producao ? /^https:\/\/[^\s/?#]+$/ : /^https?:\/\/[^\s/?#]+$/).test(siteUrl)) {
    throw new ConfigInvalidaError('SITE_URL ausente ou inválida: só a origem, sem caminho, https em produção (ex.: https://sisfin.exemplo.com).');
  }
  const exigir = (env.EXIGIR_ASSINATURA ?? 'false').toLowerCase();
  if (!['true', '1', 'false', '0'].includes(exigir)) {
    throw new ConfigInvalidaError('EXIGIR_ASSINATURA inválido: true/1 ou false/0.');
  }
  return {
    pagamentos: pagamentos as 'stripe' | 'simulador',
    stripeSecretKey: stripe ? chave : null,
    stripeWebhookSecret: webhook,
    stripePriceId: stripe ? preco : null,
    siteUrl,
    exigirAssinatura: exigir === 'true' || exigir === '1',
  };
}

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
  // Links de arquivos (logo dos bancos): URL http(s) sem barra final. Obrigatória em produção; em desenvolvimento, o
  // storage do legado local (os arquivos moram lá durante o strangler — design de contas-bancarias §3).
  const urlArquivos = (env.ASSETS_URL ?? (ambiente === 'production' ? '' : 'http://localhost:8081')).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(urlArquivos)) {
    throw new ConfigInvalidaError('ASSETS_URL ausente ou inválida: informe a URL http(s) base dos arquivos (ex.: https://sisfin.exemplo.com).');
  }
  const cadastrosPorHora = Number(env.CADASTROS_POR_HORA ?? 5);
  if (!Number.isInteger(cadastrosPorHora) || cadastrosPorHora < 1 || cadastrosPorHora > 10_000) {
    throw new ConfigInvalidaError('CADASTROS_POR_HORA inválido: inteiro de 1 a 10000 (limite de cadastros públicos por IP por hora).');
  }
  const arquivosDir = env.ARQUIVOS_DIR ?? '/data/arquivos';
  if (!isAbsolute(arquivosDir)) {
    throw new ConfigInvalidaError('ARQUIVOS_DIR inválido: informe um caminho absoluto (ex.: /data/arquivos).');
  }
  return {
    ambiente,
    porta: Number(env.PORT ?? 3000),
    jwtSegredo,
    // iss fixo pela configuração (antes vinha do cabeçalho Host, controlado pelo cliente) e verificado no token
    jwtEmissor: env.JWT_ISSUER ?? 'sisfin-api',
    debugSql,
    origensCors: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    urlArquivos,
    cadastrosPorHora,
    arquivosDir,
    ...lerPagamentos(env, ambiente),
  };
}
