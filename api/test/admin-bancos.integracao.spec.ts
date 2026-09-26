// A01–A03 — admin de bancos contra o PostgreSQL real e um diretório de arquivos temporário, pela pilha HTTP
// (roda com DATABASE_URL). Verifica no banco E no volume: autorização sem efeito, upload pelo conteúdo, ordem
// arquivo → banco → antigo, padrão intocado, nada órfão, exclusão bloqueada por uso.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BancosRepositorio } from '../src/modules/admin-bancos/infra/bancos.repositorio';
import { LimiteRequisicoes } from '../src/shared/auth-compat/controles';
import { lerConfig } from '../src/shared/config/config';
import { configurarApp } from '../src/shared/http/configurar-app';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { JPEG, PNG, WEBP } from './fixtures/imagens';

const descrever = process.env.DATABASE_URL ? describe : describe.skip;
const MENSAGEM_LOGO = { logo: ['The logo must be a PNG, JPEG or WebP image up to 1 MB.'] };

descrever('admin de bancos no banco e no volume (A01–A03, integração)', () => {
  let app: INestApplication;
  const base = new PrismaService();
  const marca = `ADB-${Date.now().toString(36)}`;
  const raizArquivos = mkdtempSync(join(tmpdir(), 'sisfin-arquivos-'));
  const dir = join(raizArquivos, 'banks', 'imagens');
  const envAntes = process.env.ARQUIVOS_DIR;
  const tokens = { admin: '', cliente: '' };
  let urlArquivos = '';

  const http = () => request(app.getHttpServer());
  const como = (quem: keyof typeof tokens, metodo: 'get' | 'post' | 'put' | 'delete', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${tokens[quem]}`);
  const arquivosNoVolume = () => (existsSync(dir) ? readdirSync(dir).sort() : []);
  const nomeDoLogo = (logo: string) => logo.replace(`${urlArquivos}/storage/banks/imagens/`, '');
  const criar = async (nome: string, logo?: Buffer, arquivo = 'logo.png') => {
    let r = como('admin', 'post', '/api/admin/banks').field('name', `${marca}-${nome}`);
    if (logo) r = r.attach('logo', logo, arquivo);
    return (await r.expect(201)).body.data as { id: number; name: string; logo: string };
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'segredo-de-teste-com-mais-de-32-bytes!!';
    process.env.ARQUIVOS_DIR = raizArquivos;
    // Esta suíte passa de 60 requisições por minuto (o limite global por IP, testado em controles-memoria e auth-compat)
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LimiteRequisicoes).useValue(new LimiteRequisicoes(Date.now, 10_000, 60_000))
      .compile();
    app = modulo.createNestApplication({ logger: false });
    const config = lerConfig();
    urlArquivos = config.urlArquivos;
    configurarApp(app, config);
    await app.init();
    for (const [quem, email] of [['admin', 'admin@user.com'], ['cliente', 'cliente1@user.com']] as const) {
      tokens[quem] = (await http().post('/api/access_token').send({ email, password: 'secret' }).expect(200)).body.token;
    }
  });

  afterAll(async () => {
    if (envAntes === undefined) delete process.env.ARQUIVOS_DIR;
    else process.env.ARQUIVOS_DIR = envAntes;
    const bancos = await base.bank.findMany({ where: { name: { startsWith: marca } }, select: { id: true } });
    const ids = bancos.map((b) => b.id);
    if (ids.length) {
      await base.bankAccount.deleteMany({ where: { bankId: { in: ids } } });
      await base.bank.deleteMany({ where: { id: { in: ids } } });
    }
    rmSync(raizArquivos, { recursive: true, force: true });
    await app.close();
    await base.$disconnect();
  });

  describe('autorização (A01, REQ-ADB-02)', () => {
    const rotas = [
      ['get', '/api/admin/banks'],
      ['get', '/api/admin/banks/1'],
      ['post', '/api/admin/banks'],
      ['put', '/api/admin/banks/1'],
      ['delete', '/api/admin/banks/1'],
    ] as const;

    it.each(rotas)('%s %s sem token → 401', async (metodo, url) => {
      const r = await http()[metodo](url).expect(401);
      expect(r.body).toEqual({ error: 'Unauthenticated.' });
    });

    it.each(rotas)('%s %s como cliente comum → 403, sem gravar nada (nem arquivo)', async (metodo, url) => {
      const antes = await base.bank.findMany({ orderBy: { id: 'asc' } });
      const r = await como('cliente', metodo, url).field('name', `${marca}-invasor`).attach('logo', PNG, 'x.png').expect(403);
      expect(r.body).toEqual({ message: 'Forbidden.' });
      expect(await base.bank.findMany({ orderBy: { id: 'asc' } })).toEqual(antes);
      expect(arquivosNoVolume()).toEqual([]);
    });
  });

  describe('listagem (A01, REQ-ADB-01)', () => {
    it('5 por página, em ordem de id, logo absoluto e paginação no formato das outras listas', async () => {
      for (const n of ['L1', 'L2', 'L3', 'L4']) await criar(n);
      const todos = await base.bank.findMany({ orderBy: { id: 'asc' } });
      const p1 = (await como('admin', 'get', '/api/admin/banks').expect(200)).body;
      expect(p1.data.map((b: { id: number }) => b.id)).toEqual(todos.slice(0, 5).map((b) => b.id));
      expect(p1.data[0]).toEqual({
        id: todos[0].id,
        name: todos[0].name,
        logo: `${urlArquivos}/storage/banks/imagens/${todos[0].logo}`,
        created_at: expect.objectContaining({ timezone: 'UTC' }),
        updated_at: expect.objectContaining({ timezone: 'UTC' }),
      });
      expect(p1.meta.pagination).toMatchObject({ total: todos.length, count: 5, per_page: 5, current_page: 1, total_pages: Math.ceil(todos.length / 5) });
      expect(p1.meta.pagination.links.next).toMatch(/\/api\/admin\/banks\?page=2$/);

      const p2 = (await como('admin', 'get', '/api/admin/banks?page=2').expect(200)).body;
      expect(p2.data.map((b: { id: number }) => b.id)).toEqual(todos.slice(5, 10).map((b) => b.id));
    });
  });

  describe('upload seguro (A02, REQ-ADB-04)', () => {
    it.each([
      ['texto com extensão .png', Buffer.from('não sou imagem'), 'logo.png'],
      ['SVG com script', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg'],
      ['arquivo vazio', Buffer.alloc(0), 'logo.png'],
    ])('%s → 422 e nada gravado', async (_n, conteudo, arquivo) => {
      const antes = await base.bank.count();
      const r = await como('admin', 'post', '/api/admin/banks').field('name', `${marca}-ruim`).attach('logo', conteudo, arquivo).expect(422);
      expect(r.body).toEqual(MENSAGEM_LOGO);
      expect(await base.bank.count()).toBe(antes);
      expect(arquivosNoVolume()).toEqual([]);
    });

    it('1 MB + 1 byte → o MESMO 422 (não 413) e nada gravado; exatamente 1 MB passa', async () => {
      const antes = await base.bank.count();
      const grande = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 1 - PNG.length)]);
      const r = await como('admin', 'post', '/api/admin/banks').field('name', `${marca}-grande`).attach('logo', grande, 'g.png').expect(422);
      expect(r.body).toEqual(MENSAGEM_LOGO);
      expect(await base.bank.count()).toBe(antes);
      expect(arquivosNoVolume()).toEqual([]);

      const limite = await criar('limite', grande.subarray(0, 1024 * 1024));
      expect(readFileSync(join(dir, nomeDoLogo(limite.logo))).length).toBe(1024 * 1024);
    });

    it('a extensão vem do tipo DETECTADO: JPEG enviado como "foto.png" vira .jpg; nome aleatório', async () => {
      const b = await criar('jpeg', JPEG, 'foto.png');
      expect(nomeDoLogo(b.logo)).toMatch(/^[0-9a-f]{32}\.jpg$/);
      const w = await criar('webp', WEBP, 'x.gif');
      expect(nomeDoLogo(w.logo)).toMatch(/^[0-9a-f]{32}\.webp$/);
      expect(readFileSync(join(dir, nomeDoLogo(w.logo)))).toEqual(WEBP);
    });
  });

  describe('criar, editar e excluir (A03, REQ-ADB-03..05)', () => {
    it('criar sem logo → 201 com default.jpg; com logo → arquivo no volume com o conteúdo enviado', async () => {
      const semLogo = await criar('sem-logo');
      expect(semLogo.logo).toBe(`${urlArquivos}/storage/banks/imagens/default.jpg`);
      const comLogo = await criar('com-logo', PNG);
      expect(readFileSync(join(dir, nomeDoLogo(comLogo.logo)))).toEqual(PNG);
      expect((await base.bank.findUniqueOrThrow({ where: { id: comLogo.id } })).logo).toBe(nomeDoLogo(comLogo.logo));
    });

    it('editar só o nome mantém o logo; trocar o logo grava o novo e APAGA o antigo', async () => {
      const b = await criar('troca', PNG);
      const antigo = nomeDoLogo(b.logo);
      const soNome = (await como('admin', 'put', `/api/admin/banks/${b.id}`).field('name', `${marca}-troca2`).expect(200)).body.data;
      expect(soNome).toMatchObject({ name: `${marca}-troca2`, logo: b.logo });
      expect(existsSync(join(dir, antigo))).toBe(true);

      const novo = (await como('admin', 'put', `/api/admin/banks/${b.id}`).field('name', `${marca}-troca3`).attach('logo', JPEG, 'n.jpg').expect(200)).body.data;
      expect(nomeDoLogo(novo.logo)).toMatch(/\.jpg$/);
      expect(readFileSync(join(dir, nomeDoLogo(novo.logo)))).toEqual(JPEG);
      expect(existsSync(join(dir, antigo))).toBe(false);
    });

    it('banco com default.jpg ganha logo: o default.jpg do volume fica intocado', async () => {
      writeFileSync(join(dir, 'default.jpg'), JPEG);
      const b = await criar('padrao');
      await como('admin', 'put', `/api/admin/banks/${b.id}`).field('name', `${marca}-padrao`).attach('logo', PNG, 'p.png').expect(200);
      await como('admin', 'delete', `/api/admin/banks/${(await criar('padrao-2')).id}`).expect(204);
      expect(readFileSync(join(dir, 'default.jpg'))).toEqual(JPEG);
    });

    it('logo compartilhado por dois bancos (dado migrado) não é apagado quando um deles troca ou sai', async () => {
      const a = await criar('comp-a', PNG);
      const nome = nomeDoLogo(a.logo);
      const b = await criar('comp-b');
      await base.bank.update({ where: { id: b.id }, data: { logo: nome } });
      await como('admin', 'put', `/api/admin/banks/${a.id}`).field('name', `${marca}-comp-a`).attach('logo', JPEG, 'j.jpg').expect(200);
      expect(existsSync(join(dir, nome))).toBe(true);
    });

    it('falha no banco ao criar ou editar → o arquivo novo NÃO fica no volume', async () => {
      const b = await criar('falha', PNG);
      const antes = arquivosNoVolume();
      const repo = app.get(BancosRepositorio);
      const criarEspiao = jest.spyOn(repo, 'criar').mockRejectedValueOnce(new Error('falha simulada'));
      await como('admin', 'post', '/api/admin/banks').field('name', `${marca}-x`).attach('logo', PNG, 'x.png').expect(500);
      const transacaoEspiao = jest.spyOn(repo, 'transacao').mockRejectedValueOnce(new Error('falha simulada'));
      await como('admin', 'put', `/api/admin/banks/${b.id}`).field('name', `${marca}-x`).attach('logo', JPEG, 'x.jpg').expect(500);
      criarEspiao.mockRestore();
      transacaoEspiao.mockRestore();
      expect(arquivosNoVolume()).toEqual(antes); // nem o novo sobrou, nem o antigo sumiu
    });

    it('excluir sem uso → 204, banco e arquivo removidos', async () => {
      const b = await criar('exclui', PNG);
      await como('admin', 'delete', `/api/admin/banks/${b.id}`).expect(204);
      expect(await base.bank.findUnique({ where: { id: b.id } })).toBeNull();
      expect(existsSync(join(dir, nomeDoLogo(b.logo)))).toBe(false);
    });

    it('excluir banco em uso (conta de QUALQUER cliente) → 422 e nada muda', async () => {
      const b = await criar('em-uso', PNG);
      const cliente3 = (await base.user.findFirstOrThrow({ where: { email: 'cliente3@user.com' } })).clientId!;
      await base.bankAccount.create({ data: { name: `${marca}-conta`, agency: '1', account: '2', bankId: b.id, clientId: cliente3 } });
      const r = await como('admin', 'delete', `/api/admin/banks/${b.id}`).expect(422);
      expect(r.body).toEqual({ message: 'Bank has bank accounts.' });
      expect(await base.bank.findUnique({ where: { id: b.id } })).not.toBeNull();
      expect(existsSync(join(dir, nomeDoLogo(b.logo)))).toBe(true);
    });

    it.each([
      ['sem name', {}, { name: ['The name field is required.'] }],
      ['name > 255', { name: 'x'.repeat(256) }, { name: ['The name may not be greater than 255 characters.'] }],
      ['campo desconhecido', { name: 'ok', logo_url: 'http://mal' }, { logo_url: ['property logo_url should not exist'] }],
    ])('%s → 422 no formato do Laravel', async (_n, corpo, erro) => {
      const r = await como('admin', 'post', '/api/admin/banks').send(corpo).expect(422);
      expect(r.body).toMatchObject(erro);
    });

    it('GET de um banco → o banco no formato da lista; inexistente → 404', async () => {
      const b = await criar('um', PNG);
      expect((await como('admin', 'get', `/api/admin/banks/${b.id}`).expect(200)).body.data).toEqual(b);
      await como('admin', 'get', '/api/admin/banks/999999').expect(404);
    });

    // Revisão de segurança (A06, docs/revisoes/2026-09-26-security-admin-bancos.md) — cada teste falhou antes da correção
    it.each([
      ['<img src=x onerror=alert(localStorage.token)>'],
      ['Banco" onmouseover="alert(1)'],
      ["Banco' x='1"],
    ])('S1: nome com marcação HTML (%s) → 422: o autocomplete do app antigo interpola o nome sem escapar', async (nome) => {
      const antes = await base.bank.count();
      const r = await como('admin', 'post', '/api/admin/banks').field('name', nome).expect(422);
      expect(r.body).toEqual({ name: ['The name may not contain the characters < > " \'.'] });
      const b = await criar('s1');
      await como('admin', 'put', `/api/admin/banks/${b.id}`).field('name', nome).expect(422);
      expect(await base.bank.count()).toBe(antes + 1);
    });

    it('S1: nome comum com "&" e acentos continua valendo', async () => {
      expect((await criar('Itaú & Cia')).name).toBe(`${marca}-Itaú & Cia`);
    });

    it('S3: dois bancos com o MESMO logo trocam de logo ao mesmo tempo → o arquivo antigo não fica órfão', async () => {
      for (let i = 0; i < 5; i++) {
        const a = await criar(`s3a-${i}`, PNG);
        const nome = nomeDoLogo(a.logo);
        const b = await criar(`s3b-${i}`);
        await base.bank.update({ where: { id: b.id }, data: { logo: nome } });
        await Promise.all(
          [a, b].map((x) => como('admin', 'put', `/api/admin/banks/${x.id}`).field('name', `${marca}-s3-${x.id}`).attach('logo', JPEG, 'j.jpg').expect(200)),
        );
        expect(existsSync(join(dir, nome))).toBe(false);
      }
    });

    it('S4: erro do upload não ecoa o nome do campo enviado', async () => {
      const r = await como('admin', 'post', '/api/admin/banks').field('name', 'x').attach('x<b>y', PNG, 'x.png').expect(400);
      expect(r.body).toEqual({ message: 'Bad Request' });
    });

    it('banco inexistente → 404 no PUT e no DELETE, sem arquivo gravado', async () => {
      const antes = arquivosNoVolume();
      await como('admin', 'put', '/api/admin/banks/999999').field('name', 'x').attach('logo', PNG, 'x.png').expect(404);
      await como('admin', 'delete', '/api/admin/banks/999999').expect(404);
      expect(arquivosNoVolume()).toEqual(antes);
    });
  });
});
