// G03 — escrita de categorias contra o PostgreSQL real, pela pilha HTTP inteira (roda com DATABASE_URL).
// Verifica no banco o que a paridade não vê: invariantes do nested set, linhas de outros clientes intocadas,
// concorrência, exclusão tudo ou nada e o fluxo de caixa seguindo a categoria movida.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;

type Linha = { id: number; name: string; parentId: number | null; lft: number; rgt: number; clientId: number };

/** Invariantes do nested set de UM cliente: faixas contíguas 1..2n e containment ⇔ ancestral por parent_id. */
function conferirArvore(linhas: Linha[]) {
  const valores = linhas.flatMap((l) => [l.lft, l.rgt]).sort((a, b) => a - b);
  expect(valores).toEqual(Array.from({ length: linhas.length * 2 }, (_, i) => i + 1));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  for (const a of linhas) {
    expect(a.lft).toBeLessThan(a.rgt);
    for (const b of linhas) {
      if (a.id === b.id) continue;
      let ancestral = false;
      for (let p = b.parentId; p !== null; p = porId.get(p)!.parentId) if (p === a.id) ancestral = true;
      expect(b.lft > a.lft && b.rgt < a.rgt).toBe(ancestral);
    }
  }
}

descrever('categorias no banco (G03, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' };
  let clienteA = 0;
  const marca = `G03-${Date.now().toString(36)}`;
  const contasCriadas: number[] = [];
  const raizesCriadas: number[] = [];

  const http = () => request(app.getHttpServer());
  const como = (quem: 'a' | 'b', metodo: 'get' | 'post' | 'put' | 'delete', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${tokens[quem]}`);
  const criar = async (nome: string, parentId?: number, rota = 'category_expenses') => {
    const r = await como('a', 'post', `/api/${rota}`).send({ name: `${marca}-${nome}`, ...(parentId ? { parent_id: parentId } : {}) }).expect(201);
    if (!parentId) raizesCriadas.push(r.body.data.id);
    return r.body.data.id as number;
  };
  const linhasDoCliente = (clientId: number) =>
    base.categoryExpense.findMany({ where: { clientId }, select: { id: true, name: true, parentId: true, lft: true, rgt: true, clientId: true } });

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app, lerConfig());
    await app.init();
    for (const [quem, email] of [['a', 'cliente1@user.com'], ['b', 'cliente3@user.com']] as const) {
      tokens[quem] = (await http().post('/api/access_token').send({ email, password: 'secret' }).expect(200)).body.token;
    }
    clienteA = (await base.user.findFirstOrThrow({ where: { email: 'cliente1@user.com' } })).clientId!;
  });

  afterAll(async () => {
    // limpeza só com ids definidos (lição da T07): contas primeiro, depois as raízes (levam a subárvore)
    for (const id of contasCriadas) await como('a', 'delete', `/api/bill_pays/${id}`);
    for (const id of raizesCriadas) await como('a', 'delete', `/api/category_expenses/${id}`);
    await app.close();
    await base.$disconnect();
  });

  it('criar, mover, promover a raiz e excluir mantêm o nested set do cliente válido (faixas contíguas por cliente)', async () => {
    const r = await criar('R');
    const f = await criar('F', r);
    const n = await criar('N', f);
    const r2 = await criar('R2');
    await como('a', 'put', `/api/category_expenses/${f}`).send({ name: `${marca}-F`, parent_id: r2 }).expect(200);
    conferirArvore(await linhasDoCliente(clienteA));
    await como('a', 'put', `/api/category_expenses/${n}`).send({ name: `${marca}-N` }).expect(200); // vira raiz
    raizesCriadas.push(n);
    conferirArvore(await linhasDoCliente(clienteA));
    await como('a', 'delete', `/api/category_expenses/${r2}`).expect(204); // leva F junto
    expect(await base.categoryExpense.count({ where: { id: { in: [r2, f] } } })).toBe(0);
    conferirArvore(await linhasDoCliente(clienteA));
    expect(r).toBeGreaterThan(0);
  }, 20_000); // ~5 s com o banco do oráculo acumulado: passava raspando do timeout padrão (etapa 27)

  it('as escritas de A NÃO tocam nenhuma linha de outro cliente (numeração por cliente)', async () => {
    const outros = () => base.categoryExpense.findMany({ where: { clientId: { not: clienteA } }, orderBy: { id: 'asc' } });
    const antes = await outros();
    const r = await criar('ISO');
    const f = await criar('ISO-F', r);
    await como('a', 'put', `/api/category_expenses/${f}`).send({ name: `${marca}-ISO-F` }).expect(200);
    raizesCriadas.push(f);
    await como('a', 'delete', `/api/category_expenses/${r}`).expect(204);
    expect(await outros()).toEqual(antes);
  });

  it('B edita, move ou exclui categoria de A → 404 e a linha de A fica IDÊNTICA (REQ-CAT-03)', async () => {
    const r = await criar('VITIMA');
    const f = await criar('VITIMA-F', r);
    const raizDeB = (await como('b', 'post', '/api/category_expenses').send({ name: `${marca}-B` }).expect(201)).body.data.id;
    const antes = await base.categoryExpense.findUniqueOrThrow({ where: { id: f } });
    await como('b', 'put', `/api/category_expenses/${f}`).send({ name: 'INVADIDA' }).expect(404);
    await como('b', 'put', `/api/category_expenses/${f}`).send({ name: 'MOVIDA', parent_id: raizDeB }).expect(404);
    await como('b', 'delete', `/api/category_expenses/${r}`).expect(404);
    await como('b', 'get', `/api/category_expenses/${f}`).expect(404);
    expect(await base.categoryExpense.findUniqueOrThrow({ where: { id: f } })).toEqual(antes);
    await como('b', 'delete', `/api/category_expenses/${raizDeB}`).expect(204);
  });

  it('10 escritas concorrentes na árvore do cliente → todas aplicadas e a árvore continua válida (advisory lock)', async () => {
    const r = await criar('CONC');
    const respostas = await Promise.all(
      Array.from({ length: 10 }, (_, i) => como('a', 'post', '/api/category_expenses').send({ name: `${marca}-C${i}`, parent_id: r })),
    );
    expect(respostas.map((x) => x.status)).toEqual(Array(10).fill(201));
    expect(await base.categoryExpense.count({ where: { parentId: r } })).toBe(10);
    conferirArvore(await linhasDoCliente(clienteA));
  });

  it('conta numa NETA bloqueia a exclusão da raiz: 422 e nada é apagado (REQ-CAT-05, corrige RN-CAT-009)', async () => {
    const r = await criar('DEL');
    const f = await criar('DEL-F', r);
    const n = await criar('DEL-N', f);
    const [conta] = (await como('a', 'get', '/api/bank_accounts').expect(200)).body.data;
    const bill = await como('a', 'post', '/api/bill_pays')
      .send({ name: `${marca}-conta`, date_due: '2018-09-05', value: 1, done: false, category_id: n, bank_account_id: conta.id }).expect(201);
    contasCriadas.push(bill.body.data.id);
    const resp = await como('a', 'delete', `/api/category_expenses/${r}`).expect(422);
    expect(resp.body).toEqual({ message: 'Category has bills.' });
    expect(await base.categoryExpense.count({ where: { id: { in: [r, f, n] } } })).toBe(3);
  });

  it('o fluxo de caixa segue a categoria movida: a soma passa para a nova raiz', async () => {
    const r1 = await criar('FLX-R1');
    const r2 = await criar('FLX-R2');
    const c = await criar('FLX-C', r1);
    const [conta] = (await como('a', 'get', '/api/bank_accounts').expect(200)).body.data;
    const bill = await como('a', 'post', '/api/bill_pays')
      .send({ name: `${marca}-flx`, date_due: '2018-05-10', value: 123.45, done: false, category_id: c, bank_account_id: conta.id }).expect(201);
    contasCriadas.push(bill.body.data.id);
    const totalNa = async (raiz: number) => {
      const fluxo = (await como('a', 'get', '/api/cash_flows?start=2018-05').expect(200)).body;
      const cat = fluxo.categories_period.expenses.data.find((x: { id: number }) => x.id === raiz);
      return cat?.periods.find((p: { period: string }) => p.period === '2018-05')?.total ?? 0;
    };
    expect(await totalNa(r1)).toBe(123.45);
    await como('a', 'put', `/api/category_expenses/${c}`).send({ name: `${marca}-FLX-C`, parent_id: r2 }).expect(200);
    expect(await totalNa(r1)).toBe(0);
    expect(await totalNa(r2)).toBe(123.45);
  });

  it('árvore corrompida no banco (pai inexistente) → 500 e NADA é gravado (rollback)', async () => {
    const r = await criar('CORR');
    const f = await criar('CORR-F', r);
    await base.categoryExpense.update({ where: { id: f }, data: { parentId: 2_000_000_000 } }); // simula órfã do legado
    try {
      const antes = await linhasDoCliente(clienteA);
      await como('a', 'post', '/api/category_expenses').send({ name: `${marca}-nao-deve-existir` }).expect(500);
      expect(await linhasDoCliente(clienteA)).toEqual(antes);
    } finally {
      await base.categoryExpense.update({ where: { id: f }, data: { parentId: r } });
    }
  });
});
