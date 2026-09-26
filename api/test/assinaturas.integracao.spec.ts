// P01/P03/P04/P05 — assinaturas contra o PostgreSQL real, pela pilha HTTP, com o SIMULADOR (sem rede) e webhooks
// ASSINADOS com o segredo de teste, exatamente como o Stripe (ou o Stripe CLI) os envia. Roda com DATABASE_URL.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GatewayDePagamento } from '../src/modules/assinaturas/application/gateway-de-pagamento';
import { LimiteRequisicoes } from '../src/shared/auth-compat/controles';
import { VerificadorDeAssinatura } from '../src/shared/tenant/assinatura.guard';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;
const stripe = new Stripe('sk_test_so_para_assinar_eventos');
const seg = (d: Date) => Math.floor(d.getTime() / 1000);
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000);

descrever('assinaturas (P01–P05, integração com o simulador)', () => {
  const base = new PrismaService();
  const marca = `ass-${Date.now().toString(36)}`;
  const envAntes = { cad: process.env.CADASTROS_POR_HORA, exigir: process.env.EXIGIR_ASSINATURA };
  const apps: INestApplication[] = [];
  let n = 0;

  async function criarApp(exigir: boolean, limiteReal = false) {
    process.env.CADASTROS_POR_HORA = '1000';
    process.env.EXIGIR_ASSINATURA = exigir ? 'true' : 'false';
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const construtor = Test.createTestingModule({ imports: [AppModule] });
    if (!limiteReal) construtor.overrideProvider(LimiteRequisicoes).useValue(new LimiteRequisicoes(Date.now, 10_000, 60_000));
    const modulo = await construtor.compile();
    const app = modulo.createNestApplication({ logger: false, rawBody: true });
    configurarApp(app, lerConfig());
    await app.init();
    apps.push(app);
    return app;
  }

  /** Cliente novo (cadastro público): isolado dos dados do seed. */
  async function novoCliente(app: INestApplication) {
    const id = `${marca}-${++n}`;
    const r = await request(app.getHttpServer()).post('/api/register').send({
      name: `Pessoa ${id}`, email: `${id}@x.com`, password: 'segredo1', password_confirmation: 'segredo1',
      client: { name: `Empresa ${id}`, email: `empresa-${id}@x.com` },
    }).expect(201);
    const u = await base.user.findUniqueOrThrow({ where: { email: `${id}@x.com` } });
    return { token: r.body.token as string, clienteId: u.clientId! };
  }

  /** Evento no formato do Stripe, assinado com o segredo do webhook (o do simulador em desenvolvimento). */
  function evento(tipo: string, sub: Record<string, unknown>, criado = new Date(), id = `evt_${marca}_${++n}`) {
    const corpo = JSON.stringify({
      id, object: 'event', type: tipo, created: seg(criado), api_version: '2026-08-26.dahlia',
      data: { object: { object: 'subscription', cancel_at_period_end: false, canceled_at: null, ...sub } },
    });
    return { id, corpo, assinatura: stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: lerConfig().stripeWebhookSecret }) };
  }
  const assinaturaAtiva = (clienteId: number, extra: Record<string, unknown> = {}) => ({
    id: `sub_${marca}_${clienteId}`, customer: `cus_sim_${clienteId}`, status: 'active',
    items: { object: 'list', data: [{ current_period_end: seg(daqui(30)) }] }, ...extra,
  });
  const enviar = (app: INestApplication, e: { corpo: string; assinatura?: string }) => {
    const r = request(app.getHttpServer()).post('/api/hooks/stripe').set('Content-Type', 'application/json');
    return (e.assinatura ? r.set('Stripe-Signature', e.assinatura) : r).send(e.corpo);
  };

  afterAll(async () => {
    const clientes = await base.client.findMany({ where: { name: { startsWith: `Empresa ${marca}` } }, select: { id: true } });
    const ids = clientes.map((c) => c.id);
    if (ids.length) {
      await base.subscription.deleteMany({ where: { clientId: { in: ids } } });
      await base.user.deleteMany({ where: { clientId: { in: ids } } });
      await base.client.deleteMany({ where: { id: { in: ids } } });
    }
    await base.webhookEvent.deleteMany({ where: { id: { startsWith: `evt_${marca}` } } });
    for (const app of apps) await app.close();
    for (const [k, v] of [['CADASTROS_POR_HORA', envAntes.cad], ['EXIGIR_ASSINATURA', envAntes.exigir]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await base.$disconnect();
  });

  describe('com o gate desligado (padrão)', () => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());
    beforeAll(async () => {
      app = await criarApp(false);
    });

    it('P01: GET /api/plans → o plano migrado, valor em número; sem token → 401', async () => {
      await http().get('/api/plans').expect(401);
      const { token } = await novoCliente(app);
      const r = await http().get('/api/plans').set('Authorization', `Bearer ${token}`).expect(200);
      expect(r.body.data).toEqual([{ id: 1, name: 'Plano Empresarial', description: 'Plano Empresarial para SisFin', value: 40 }]);
    });

    it('P03: checkout → URL da sessão; cliente do provedor criado UMA vez; a sessão aberta é reaproveitada', async () => {
      const { token, clienteId } = await novoCliente(app);
      const gateway = app.get(GatewayDePagamento);
      const criarCliente = jest.spyOn(gateway, 'criarCliente');
      const criarCheckout = jest.spyOn(gateway, 'criarCheckout');
      try {
        const r1 = await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${token}`).expect(200);
        expect(r1.body).toEqual({ url: 'http://localhost:8083/subscriptions/successfully?simulador=1' });
        expect((await base.client.findUniqueOrThrow({ where: { id: clienteId } })).stripeCustomerId).toBe(`cus_sim_${clienteId}`);
        const r2 = await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${token}`).expect(200);
        expect(r2.body.url).toBe(r1.body.url);
        expect(criarCliente).toHaveBeenCalledTimes(1);
        expect(criarCheckout).toHaveBeenCalledTimes(1);
      } finally {
        criarCliente.mockRestore();
        criarCheckout.mockRestore();
      }
    });

    it('P03: dois checkouts SIMULTÂNEOS do mesmo cliente → uma sessão só (sem cobrança dupla)', async () => {
      const { token } = await novoCliente(app);
      // demora como uma chamada real ao Stripe: sem o lock, os três pedidos entram juntos (com o simulador instantâneo a
      // janela de corrida quase não existia e a mutação "sem lock" passava)
      const gateway = app.get(GatewayDePagamento);
      const original = gateway.criarCheckout.bind(gateway);
      const criarCheckout = jest.spyOn(gateway, 'criarCheckout').mockImplementation(async (d) => {
        await new Promise((ok) => setTimeout(ok, 300));
        return original(d);
      });
      try {
        const rs = await Promise.all([1, 2, 3].map(() => http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${token}`)));
        expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
        expect(new Set(rs.map((r) => r.body.url)).size).toBe(1);
        expect(criarCheckout).toHaveBeenCalledTimes(1);
      } finally {
        criarCheckout.mockRestore();
      }
    });

    it('P03/P04: pago (webhook) → GET /api/subscription ativa; novo checkout → 422; outro cliente não vê', async () => {
      const a = await novoCliente(app);
      const b = await novoCliente(app);
      await http().get('/api/subscription').set('Authorization', `Bearer ${a.token}`).expect(404);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId))).expect(200);

      const r = await http().get('/api/subscription').set('Authorization', `Bearer ${a.token}`).expect(200);
      expect(r.body.data).toMatchObject({ status: 'active', cancel_at_period_end: false, plan: { name: 'Plano Empresarial', value: 40 } });
      expect(new Date(r.body.data.current_period_end).getTime()).toBeGreaterThan(Date.now());
      const de = await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(422);
      expect(de.body).toEqual({ message: 'Client already has an active subscription.' });
      await http().get('/api/subscription').set('Authorization', `Bearer ${b.token}`).expect(404);
      // a sessão guardada foi limpa quando a assinatura ficou viva
      expect((await base.client.findUniqueOrThrow({ where: { id: a.clienteId } })).checkoutSessionUrl).toBeNull();
    });

    it('P03: portal → URL para quem já tem cadastro no provedor; sem cadastro → 404', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/portal').set('Authorization', `Bearer ${a.token}`).expect(404);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      const r = await http().post('/api/subscriptions/portal').set('Authorization', `Bearer ${a.token}`).expect(200);
      expect(r.body).toEqual({ url: 'http://localhost:8083/my-financial?portal=simulador' });
    });

    describe('P04: webhook', () => {
      const semEfeito = async (clienteId: number) =>
        expect(await base.subscription.count({ where: { clientId: clienteId } })).toBe(0);

      it.each([
        ['sem Stripe-Signature', (e: { corpo: string; assinatura: string }) => ({ corpo: e.corpo })],
        ['assinado com OUTRO segredo', (e: { corpo: string }) => ({ corpo: e.corpo, assinatura: stripe.webhooks.generateTestHeaderString({ payload: e.corpo, secret: 'whsec_outro' }) })],
        ['corpo alterado depois de assinado', (e: { corpo: string; assinatura: string }) => ({ corpo: e.corpo.replace('"active"', '"trialing"'), assinatura: e.assinatura })],
      ])('%s → 400 e nada gravado (o do legado aceitava evento forjado — RN-ASS-005)', async (_n, adulterar) => {
        const a = await novoCliente(app);
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        const r = await enviar(app, adulterar(evento('customer.subscription.created', assinaturaAtiva(a.clienteId)))).expect(400);
        expect(r.body).toEqual({ message: 'Invalid signature.' });
        await semEfeito(a.clienteId);
      });

      it('evento REPETIDO (mesmo id) → 200 e processado uma vez só', async () => {
        const a = await novoCliente(app);
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        const e1 = evento('customer.subscription.created', assinaturaAtiva(a.clienteId));
        await enviar(app, e1).expect(200);
        // mesmo id, conteúdo diferente: não pode mudar nada
        const e2 = evento('customer.subscription.updated', assinaturaAtiva(a.clienteId, { status: 'canceled' }), new Date(Date.now() + 60_000), e1.id);
        await enviar(app, e2).expect(200);
        expect((await base.subscription.findFirstOrThrow({ where: { clientId: a.clienteId } })).status).toBe('active');
      });

      it('evento FORA DE ORDEM: um "active" mais antigo que chega depois de "past_due" é ignorado', async () => {
        const a = await novoCliente(app);
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        await enviar(app, evento('customer.subscription.updated', assinaturaAtiva(a.clienteId, { status: 'past_due' }), new Date(Date.now() - 1_000))).expect(200);
        await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId), new Date(Date.now() - 60_000))).expect(200);
        expect((await base.subscription.findFirstOrThrow({ where: { clientId: a.clienteId } })).status).toBe('past_due');
      });

      it('cancelamento no fim do período e depois excluída: o estado acompanha', async () => {
        const a = await novoCliente(app);
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId), new Date(Date.now() - 120_000))).expect(200);
        await enviar(app, evento('customer.subscription.updated', assinaturaAtiva(a.clienteId, { cancel_at_period_end: true, canceled_at: seg(new Date()) }), new Date(Date.now() - 60_000))).expect(200);
        let s = await base.subscription.findFirstOrThrow({ where: { clientId: a.clienteId } });
        expect(s).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
        await enviar(app, evento('customer.subscription.deleted', assinaturaAtiva(a.clienteId, { status: 'canceled', canceled_at: seg(new Date()) }))).expect(200);
        s = await base.subscription.findFirstOrThrow({ where: { clientId: a.clienteId } });
        expect(s.status).toBe('canceled');
        // cancelada: pode assinar de novo
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      });

      it('cliente do provedor desconhecido e evento que não é de assinatura → 200 e nada gravado', async () => {
        const antes = await base.subscription.count();
        await enviar(app, evento('customer.subscription.created', assinaturaAtiva(999_999))).expect(200);
        const fatura = evento('invoice.paid', { id: 'in_1', object: 'invoice', customer: 'cus_sim_1' });
        await enviar(app, fatura).expect(200);
        expect(await base.subscription.count()).toBe(antes);
      });

      it('/api/hooks/iugu não existe mais (404)', async () => {
        await http().post('/api/hooks/iugu').send({ event: 'invoice.status_changed', data: { id: 'x', status: 'paid' } }).expect(404);
      });
    });
  });

  // Revisão de segurança A07 (docs/revisoes/2026-09-26-security-assinaturas.md) — cada teste falhou antes da correção
  describe('revisão de segurança (A07)', () => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());
    beforeAll(async () => {
      app = await criarApp(false);
    });
    const statusLocal = async (clienteId: number) => (await base.subscription.findMany({ where: { clientId: clienteId } })).map((s) => s.status);

    it('S1: "created incomplete" e "updated active" SIMULTÂNEOS (fechamento do Checkout) → fica active, uma linha só', async () => {
      for (let i = 0; i < 8; i++) {
        const a = await novoCliente(app);
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        const t = new Date(Date.now() - 10_000);
        const rs = await Promise.all([
          enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId, { status: 'incomplete' }), t)),
          enviar(app, evento('customer.subscription.updated', assinaturaAtiva(a.clienteId), new Date(t.getTime() + 1_000))),
        ]);
        expect(rs.map((r) => r.status)).toEqual([200, 200]);
        expect(await statusLocal(a.clienteId)).toEqual(['active']);
      }
    }, 60_000);

    it('S1: o estado gravado é o ATUAL do provedor (estadoAtual), não o que veio no evento', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      const gateway = app.get(GatewayDePagamento);
      const atual = jest.spyOn(gateway, 'estadoAtual').mockImplementation(async (sub) => ({ ...sub, status: 'past_due' }));
      try {
        await enviar(app, evento('customer.subscription.updated', assinaturaAtiva(a.clienteId))).expect(200);
      } finally {
        atual.mockRestore();
      }
      expect(await statusLocal(a.clienteId)).toEqual(['past_due']);
    });

    it('S3: assinatura ativa + outra que expirou incompleta depois → GET e o gate enxergam a ATIVA', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId), new Date(Date.now() - 60_000))).expect(200);
      const outra = { id: `sub_${marca}_${a.clienteId}_2`, customer: `cus_sim_${a.clienteId}`, items: { object: 'list', data: [{ current_period_end: seg(daqui(30)) }] } };
      await enviar(app, evento('customer.subscription.created', { ...outra, status: 'incomplete' }, new Date(Date.now() - 30_000))).expect(200);
      await enviar(app, evento('customer.subscription.updated', { ...outra, status: 'incomplete_expired' })).expect(200);
      const r = await http().get('/api/subscription').set('Authorization', `Bearer ${a.token}`).expect(200);
      expect(r.body.data.status).toBe('active');
      expect(await app.get(VerificadorDeAssinatura).acesso(a.clienteId)).toBe('liberado');
    });

    it('segunda assinatura ATIVA do mesmo cliente (não deveria existir) → 200 sem registrar; a primeira continua', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId), new Date(Date.now() - 60_000))).expect(200);
      const outra = { id: `sub_${marca}_${a.clienteId}_dup`, customer: `cus_sim_${a.clienteId}`, status: 'active', items: { object: 'list', data: [{ current_period_end: seg(daqui(30)) }] } };
      await enviar(app, evento('customer.subscription.created', outra)).expect(200);
      expect(await statusLocal(a.clienteId)).toEqual(['active']);
    });

    it('S4: sessão guardada perto de vencer → a anterior é EXPIRADA antes de abrir outra (duas abas pagáveis)', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      const antiga = await base.client.findUniqueOrThrow({ where: { id: a.clienteId } });
      expect(antiga.checkoutSessionId).toMatch(/^cs_sim_/);
      await base.client.update({ where: { id: a.clienteId }, data: { checkoutSessionExpiresAt: new Date(Date.now() + 5 * 60_000) } });
      const expirar = jest.spyOn(app.get(GatewayDePagamento), 'expirarCheckout');
      try {
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
        expect(expirar).toHaveBeenCalledWith(antiga.checkoutSessionId);
      } finally {
        expirar.mockRestore();
      }
    });

    it('S4: o PROVEDOR já tem assinatura (webhook atrasado ou perdido) → 422 e nenhuma sessão nova', async () => {
      const a = await novoCliente(app);
      await base.client.update({ where: { id: a.clienteId }, data: { stripeCustomerId: `cus_sim_${a.clienteId}` } });
      const gateway = app.get(GatewayDePagamento);
      const viva = jest.spyOn(gateway, 'temAssinaturaViva').mockResolvedValue(true);
      const criar = jest.spyOn(gateway, 'criarCheckout');
      try {
        await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(422);
        expect(criar).not.toHaveBeenCalled();
      } finally {
        viva.mockRestore();
        criar.mockRestore();
      }
    });

    it('S8: só uma assinatura "incomplete" (3DS abandonado) → pode tentar pagar de novo', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId, { status: 'incomplete' }))).expect(200);
      await base.client.update({ where: { id: a.clienteId }, data: { checkoutSessionUrl: null, checkoutSessionExpiresAt: null } });
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
    });

    it('S7: o webhook não entra no limite de 60/min por IP (um pico de renovações viraria 429 e horas de reenvio)', async () => {
      const comLimite = await criarApp(false, true);
      const rs: number[] = [];
      for (let i = 0; i < 65; i++) rs.push((await enviar(comLimite, evento('invoice.paid', { id: `in_${i}`, object: 'invoice' }))).status);
      expect(rs.filter((s) => s !== 200)).toEqual([]);
    }, 60_000);
  });

  describe('P05: com o gate LIGADO (EXIGIR_ASSINATURA=true)', () => {
    let app: INestApplication;
    const http = () => request(app.getHttpServer());
    beforeAll(async () => {
      app = await criarApp(true);
    });

    it('sem assinatura → 400 subscription_not_found nas rotas de dados; login, usuário, planos e assinatura livres', async () => {
      const a = await novoCliente(app);
      const r = await http().get('/api/bank_accounts').set('Authorization', `Bearer ${a.token}`).expect(400);
      expect(r.body).toEqual({ error: 'subscription_not_found', message: 'Cliente sem assinatura contratada.' });
      await http().get('/api/user').set('Authorization', `Bearer ${a.token}`).expect(200);
      await http().get('/api/plans').set('Authorization', `Bearer ${a.token}`).expect(200);
      await http().get('/api/subscription').set('Authorization', `Bearer ${a.token}`).expect(404);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
    });

    it('ativa → libera; cancelada → 403 subscription_expired', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId), new Date(Date.now() - 60_000))).expect(200);
      await http().get('/api/bank_accounts').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.deleted', assinaturaAtiva(a.clienteId, { status: 'canceled' }))).expect(200);
      const r = await http().get('/api/bank_accounts').set('Authorization', `Bearer ${a.token}`).expect(403);
      expect(r.body).toEqual({ error: 'subscription_expired', message: 'Assinatura expirada.' });
    });

    it('período vencido além da tolerância de 2 dias → 403 (a regra do CheckSubscription do legado)', async () => {
      const a = await novoCliente(app);
      await http().post('/api/subscriptions/checkout').set('Authorization', `Bearer ${a.token}`).expect(200);
      await enviar(app, evento('customer.subscription.created', assinaturaAtiva(a.clienteId, { items: { object: 'list', data: [{ current_period_end: seg(daqui(-3)) }] } }))).expect(200);
      await http().get('/api/bank_accounts').set('Authorization', `Bearer ${a.token}`).expect(403);
    });
  });
});
