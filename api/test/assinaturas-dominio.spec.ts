// P02 — domínio das assinaturas: o gate (regra do CheckSubscription do legado — RN-ASS-006) e a aplicação de eventos
// do provedor (ordem e repetição não garantidas — REQ-ASS-03). Funções puras.
import { acessoPelaAssinatura } from '../src/modules/assinaturas/domain/assinatura';
import { AssinaturaDoProvedor, decidirEstado, EstadoLocal } from '../src/modules/assinaturas/domain/eventos';

const agora = new Date('2026-09-26T12:00:00Z');
const futuro = new Date('2026-10-26T12:00:00Z');
const passado = new Date('2026-09-01T12:00:00Z');

describe('gate de assinatura (P02/P05, RN-ASS-006)', () => {
  it('sem assinatura → sem_assinatura (o legado: 400 subscription_not_found)', () => {
    expect(acessoPelaAssinatura(null, agora)).toBe('sem_assinatura');
  });

  it.each([
    ['ativa, período no futuro', { status: 'active', fimDoPeriodo: futuro }, 'liberado'],
    ['em teste grátis', { status: 'trialing', fimDoPeriodo: futuro }, 'liberado'],
    ['ativa com cancelamento marcado para o fim do período (paga até lá)', { status: 'active', fimDoPeriodo: futuro }, 'liberado'],
    ['período vencido há mais que a tolerância', { status: 'active', fimDoPeriodo: passado }, 'expirada'],
    // Revisão de segurança A07 (S7): a renovação chega por webhook; um atraso (reenvio do Stripe) não pode bloquear quem
    // já pagou. Tolerância de 2 dias depois do fim do período, só para status que liberam
    ['vencido há 1 dia (renovação ainda chegando)', { status: 'active', fimDoPeriodo: new Date('2026-09-25T12:00:00Z') }, 'liberado'],
    ['vencido há 3 dias', { status: 'active', fimDoPeriodo: new Date('2026-09-23T11:59:00Z') }, 'expirada'],
    ['em atraso não ganha tolerância', { status: 'past_due', fimDoPeriodo: new Date('2026-09-25T12:00:00Z') }, 'expirada'],
    ['sem data de fim (o legado: sem expires_at → expirada)', { status: 'active', fimDoPeriodo: null }, 'expirada'],
    ['cancelada', { status: 'canceled', fimDoPeriodo: futuro }, 'expirada'],
    ['pagamento em atraso', { status: 'past_due', fimDoPeriodo: futuro }, 'expirada'],
    ['não paga', { status: 'unpaid', fimDoPeriodo: futuro }, 'expirada'],
    ['checkout incompleto', { status: 'incomplete', fimDoPeriodo: futuro }, 'expirada'],
  ])('%s → %s', (_n, a, esperado) => {
    expect(acessoPelaAssinatura(a, agora)).toBe(esperado);
  });
});

describe('eventos do provedor → estado local (P02/P04, REQ-ASS-03)', () => {
  const sub = (extra: Partial<AssinaturaDoProvedor> = {}): AssinaturaDoProvedor => ({
    id: 'sub_1', cliente: 'cus_1', status: 'active', fimDoPeriodo: futuro, cancelarNoFim: false, canceladaEm: null, ...extra,
  });
  const t = (s: string) => new Date(`2026-09-26T${s}Z`);

  it('primeiro evento cria o estado a partir do objeto do provedor', () => {
    expect(decidirEstado(null, sub(), t('10:00:00'))).toEqual({
      status: 'active', fimDoPeriodo: futuro, cancelarNoFim: false, canceladaEm: null, ultimoEventoEm: t('10:00:00'),
    });
  });

  it('evento mais novo atualiza', () => {
    const atual = decidirEstado(null, sub(), t('10:00:00'))!;
    expect(decidirEstado(atual, sub({ cancelarNoFim: true }), t('10:05:00'))).toMatchObject({ cancelarNoFim: true, ultimoEventoEm: t('10:05:00') });
  });

  it('evento MAIS ANTIGO que chega depois é ignorado (o Stripe não garante a ordem)', () => {
    const atual = decidirEstado(null, sub({ status: 'past_due' }), t('10:05:00'))!;
    expect(decidirEstado(atual, sub({ status: 'active' }), t('10:00:00'))).toBeNull();
  });

  it('cancelada não volta a ativa (no Stripe, cancelada é final): um "active" atrasado é ignorado', () => {
    const cancelada: EstadoLocal = { status: 'canceled', fimDoPeriodo: passado, cancelarNoFim: false, canceladaEm: passado, ultimoEventoEm: t('10:00:00') };
    expect(decidirEstado(cancelada, sub({ status: 'active' }), t('10:00:00'))).toBeNull();
  });

  it('S2: mesmo segundo, "incomplete" chegando DEPOIS de "active" → ignorado (o created e o updated do checkout saem juntos)', () => {
    const atual = decidirEstado(null, sub({ status: 'active' }), t('10:00:00'))!;
    expect(decidirEstado(atual, sub({ status: 'incomplete' }), t('10:00:00'))).toBeNull();
  });

  it('mesmo instante (created e updated no mesmo segundo): aplica — o último a chegar vale', () => {
    const atual = decidirEstado(null, sub({ status: 'incomplete' }), t('10:00:00'))!;
    expect(decidirEstado(atual, sub({ status: 'active' }), t('10:00:00'))).toMatchObject({ status: 'active' });
  });
});
