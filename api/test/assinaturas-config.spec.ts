// P02 — configuração de pagamentos (REQ-ASS-07): produção só com o Stripe e as três chaves; nada de chave versionada.
import { ConfigInvalidaError, lerConfig } from '../src/shared/config/config';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-bytes!!';
const STRIPE = {
  PAGAMENTOS: 'stripe',
  STRIPE_SECRET_KEY: 'sk_live_abc123',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  STRIPE_PRICE_ID: 'price_abc123',
  SITE_URL: 'https://sisfin.exemplo.com',
  ASSETS_URL: 'https://sisfin.exemplo.com',
};
const producao = (extra: Record<string, string | undefined> = {}) =>
  lerConfig({ NODE_ENV: 'production', JWT_SECRET: 'segredo-proprio-de-producao-com-32-bytes!', ...STRIPE, ...extra });

describe('configuração de pagamentos (P02, REQ-ASS-07)', () => {
  it('desenvolvimento sem nada: simulador, gate desligado e um segredo de webhook só local', () => {
    const c = lerConfig({ JWT_SECRET: SEGREDO });
    expect(c.pagamentos).toBe('simulador');
    expect(c.exigirAssinatura).toBe(false);
    expect(c.stripeWebhookSecret).toMatch(/^whsec_/);
    expect(c.siteUrl).toBe('http://localhost:8083');
  });

  it('produção com o Stripe e as três chaves sobe', () => {
    const c = producao();
    expect(c).toMatchObject({ pagamentos: 'stripe', stripeSecretKey: 'sk_live_abc123', stripePriceId: 'price_abc123', siteUrl: 'https://sisfin.exemplo.com' });
  });

  it.each([
    ['o simulador', { PAGAMENTOS: 'simulador' }],
    ['sem PAGAMENTOS', { PAGAMENTOS: undefined }],
    ['sem STRIPE_SECRET_KEY', { STRIPE_SECRET_KEY: undefined }],
    ['sem STRIPE_WEBHOOK_SECRET', { STRIPE_WEBHOOK_SECRET: undefined }],
    ['sem STRIPE_PRICE_ID', { STRIPE_PRICE_ID: undefined }],
    ['sem SITE_URL', { SITE_URL: undefined }],
    ['chave publicável no lugar da secreta', { STRIPE_SECRET_KEY: 'pk_test_abc' }],
    ['segredo de webhook fora do formato', { STRIPE_WEBHOOK_SECRET: 'abc' }],
    ['preço fora do formato', { STRIPE_PRICE_ID: 'plan_business' }],
    ['SITE_URL com caminho', { SITE_URL: 'https://sisfin.exemplo.com/app' }],
    // Revisão de segurança A07 (S6): chave de TESTE em produção = o cartão 4242 libera o app de graça
    ['chave secreta de TESTE', { STRIPE_SECRET_KEY: 'sk_test_abc123' }],
    ['SITE_URL sem https', { SITE_URL: 'http://sisfin.exemplo.com' }],
  ])('produção com %s → a API não sobe', (_n, extra) => {
    expect(() => producao(extra)).toThrow(ConfigInvalidaError);
  });

  // Revisão de segurança A07 (S5): o simulador tem segredo público e ids previsíveis — qualquer um forjaria eventos.
  // Só vale em development/test (lista fechada), não em "qualquer coisa que não seja production"
  it.each([['staging'], ['prod'], ['homologacao']])('NODE_ENV=%s sem Stripe → não sobe (nem cai no simulador)', (ambiente) => {
    expect(() => lerConfig({ JWT_SECRET: SEGREDO, NODE_ENV: ambiente })).toThrow(ConfigInvalidaError);
    expect(() => lerConfig({ JWT_SECRET: SEGREDO, NODE_ENV: ambiente, PAGAMENTOS: 'simulador' })).toThrow(ConfigInvalidaError);
  });

  it('NODE_ENV=test pode usar o simulador', () => {
    expect(lerConfig({ JWT_SECRET: SEGREDO, NODE_ENV: 'test' }).pagamentos).toBe('simulador');
  });

  it('PAGAMENTOS desconhecido → não sobe', () => {
    expect(() => lerConfig({ JWT_SECRET: SEGREDO, PAGAMENTOS: 'iugu' })).toThrow(ConfigInvalidaError);
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('EXIGIR_ASSINATURA=%s → %s', (valor, esperado) => {
    expect(lerConfig({ JWT_SECRET: SEGREDO, EXIGIR_ASSINATURA: valor }).exigirAssinatura).toBe(esperado);
  });

  it('EXIGIR_ASSINATURA inválido → não sobe (um erro de digitação não pode desligar a cobrança em silêncio)', () => {
    expect(() => lerConfig({ JWT_SECRET: SEGREDO, EXIGIR_ASSINATURA: 'sim' })).toThrow(ConfigInvalidaError);
  });
});
