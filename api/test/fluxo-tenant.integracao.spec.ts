// F06 — rotas HTTP do fluxo de caixa: autenticação, validação do ?start= e cliente A × B pela rota
// (achado da revisão de segurança do módulo — o mesmo nº 5 da revisão de contas). Roda com DATABASE_URL.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

descrever('fluxo de caixa pelas rotas HTTP (F06, integração)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const marca = `F06-${Date.now()}`;
  const criadas: number[] = [];
  const get = (quem: 'a' | 'b', url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[quem]}`);

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
    for (const [quem, email] of [['a', 'cliente1@user.com'], ['b', 'cliente3@user.com']] as const) {
      tokens[quem] = (await request(app.getHttpServer()).post('/api/access_token').send({ email, password: 'secret' }).expect(200)).body.token;
    }
  });

  afterAll(async () => {
    for (const id of criadas) await request(app.getHttpServer()).delete(`/api/bill_pays/${id}`).set('Authorization', `Bearer ${tokens.a}`);
    await app.close();
  });

  it('sem token → 401 nas duas rotas', async () => {
    await request(app.getHttpServer()).get('/api/cash_flows').expect(401);
    await request(app.getHttpServer()).get('/api/cash_flows/monthly').expect(401);
  });

  it.each([
    ['vazio', '/api/cash_flows?start='],
    ['repetido (vira array)', '/api/cash_flows?start=2018-02&start=2019-01'],
    ['mês 13', '/api/cash_flows?start=2018-13'],
    ['ano < 100 (Date.UTC viraria 1950)', '/api/cash_flows?start=0050-06'],
    ['injeção', "/api/cash_flows?start=2018-02'%20OR%201=1--"],
  ])('?start %s → 422 (sem vazar a entrada)', async (_n, url) => {
    const r = await get('a', url).expect(422);
    expect(r.body).toEqual({ start: ['The start must be a month in the format YYYY-MM.'] });
  });

  it('?start[x]=1 NÃO vira objeto: o parser de query do Express 5 é o simples — é outro parâmetro, ignorado (janela padrão)', async () => {
    const padrao = (await get('a', '/api/cash_flows').expect(200)).body;
    expect((await get('a', '/api/cash_flows?start[x]=1').expect(200)).body).toEqual(padrao);
  });

  it('A × B pela rota: o que A lança no mês não aparece no fluxo nem no gráfico de B', async () => {
    const [conta] = (await get('a', '/api/bank_accounts').expect(200)).body.data;
    const [categoria] = (await get('a', '/api/category_expenses').expect(200)).body.data;
    const daqui3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const antesB = { mensal: (await get('b', `/api/cash_flows?start=${daqui3.slice(0, 7)}`)).body, diario: (await get('b', '/api/cash_flows/monthly')).body };
    const criada = await request(app.getHttpServer())
      .post('/api/bill_pays').set('Authorization', `Bearer ${tokens.a}`)
      .send({ name: marca, date_due: daqui3, value: 4321, done: false, category_id: categoria.id, bank_account_id: conta.id })
      .expect(201);
    criadas.push(criada.body.data.id);

    const doA = (await get('a', `/api/cash_flows?start=${daqui3.slice(0, 7)}`).expect(200)).body;
    expect(doA.period_list.find((p: { period: string }) => p.period === daqui3.slice(0, 7)).expenses.total).toBeGreaterThanOrEqual(4321);
    expect((await get('b', `/api/cash_flows?start=${daqui3.slice(0, 7)}`).expect(200)).body).toEqual(antesB.mensal);
    expect((await get('b', '/api/cash_flows/monthly').expect(200)).body).toEqual(antesB.diario);
  });
});
