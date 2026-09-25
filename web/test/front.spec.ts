// S03–S05 — partes puras do front novo: erros da API → tela, sessão compartilhada com o app, token fora da URL.
import { describe, expect, it, vi } from 'vitest';
import { chamar, interpretarErro } from '../src/api';
import { CHAVE_TOKEN, CHAVE_USUARIO, entrar, sair } from '../src/sessao';
import { removerTokenDaUrl, semToken } from '../src/token-na-url';

const resposta = (status: number, corpo: unknown) => new Response(corpo === undefined ? '' : JSON.stringify(corpo), { status });

describe('interpretarErro', () => {
  it('422 do Laravel → mensagens por campo (a chave aninhada fica "client.name")', () => {
    expect(interpretarErro(422, { email: ['The email has already been taken.'], 'client.name': ['The client.name field is required.'] })).toEqual({
      campos: { email: ['The email has already been taken.'], 'client.name': ['The client.name field is required.'] },
      geral: null,
    });
  });

  it('{ message } (credencial, bloqueio) → mensagem geral', () => {
    expect(interpretarErro(400, { message: 'These credentials do not match our records.' })).toEqual({ campos: {}, geral: 'These credentials do not match our records.' });
    expect(interpretarErro(403, { message: 'Too many login attempts. Please try again in 60 seconds.' }).geral).toMatch(/Too many/);
  });

  it('corpo inesperado → mensagem genérica (sem quebrar)', () => {
    expect(interpretarErro(500, null).geral).toBeTruthy();
    expect(interpretarErro(429, 'x').geral).toBe('Too Many Attempts.');
  });
});

describe('chamar', () => {
  it('token vai no cabeçalho Authorization — NUNCA na URL (REQ-SIT-06)', async () => {
    const f = vi.fn(async () => resposta(200, { ok: 1 }));
    await chamar('GET', '/user', { token: 'abc.def.ghi', base: 'http://api', fetch: f as unknown as typeof fetch });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/user');
    expect(url).not.toContain('abc.def.ghi');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc.def.ghi');
  });

  it('erro → ok:false com status e campos', async () => {
    const f = vi.fn(async () => resposta(422, { name: ['The name field is required.'] }));
    const r = await chamar('POST', '/register', { corpo: {}, base: 'http://api', fetch: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, status: 422, campos: { name: ['The name field is required.'] }, geral: null });
  });
});

describe('sessão compartilhada com o app (mesmas chaves: token, user)', () => {
  it('entrar grava o token e o usuário de /api/user (o menu do app mostra o nome)', async () => {
    const f = vi.fn(async () => resposta(200, { id: 7, name: 'Ana', email: 'a@x.com', client_id: 3 }));
    expect(await entrar('tkn', { armazenamento: localStorage, base: 'http://api', fetch: f as unknown as typeof fetch })).toBe(true);
    expect(localStorage.getItem(CHAVE_TOKEN)).toBe('tkn');
    expect(JSON.parse(localStorage.getItem(CHAVE_USUARIO)!)).toMatchObject({ name: 'Ana' });
  });

  it('se /api/user falhar, nada fica gravado', async () => {
    const f = vi.fn(async () => resposta(401, { message: 'Unauthenticated.' }));
    expect(await entrar('ruim', { armazenamento: localStorage, base: 'http://api', fetch: f as unknown as typeof fetch })).toBe(false);
    expect(localStorage.getItem(CHAVE_TOKEN)).toBeNull();
    expect(localStorage.getItem(CHAVE_USUARIO)).toBeNull();
  });

  it('sair apaga as duas chaves', () => {
    localStorage.setItem(CHAVE_TOKEN, 'x');
    localStorage.setItem(CHAVE_USUARIO, '{}');
    sair();
    expect([localStorage.getItem(CHAVE_TOKEN), localStorage.getItem(CHAVE_USUARIO)]).toEqual([null, null]);
  });
});

describe('token fora da URL (REQ-SIT-06 / DUV-SIT-003)', () => {
  it.each([
    ['http://h/my-financial?token=abc', '/my-financial'],
    ['http://h/my-financial?a=1&token=abc&b=2#x', '/my-financial?a=1&b=2#x'],
  ])('%s → %s', (antes, depois) => {
    expect(semToken(antes)).toBe(depois);
  });

  it('sem token → não mexe', () => {
    expect(semToken('http://h/my-financial?a=1')).toBeNull();
  });

  it('usa replaceState (não deixa a URL com token no histórico)', () => {
    const replaceState = vi.fn();
    const janela = { location: { href: 'http://h/my-financial?token=abc' }, history: { state: null, replaceState } } as unknown as Window;
    expect(removerTokenDaUrl(janela)).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/my-financial');
  });
});
