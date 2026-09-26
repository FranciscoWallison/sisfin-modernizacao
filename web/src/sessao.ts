// Sessão COMPARTILHADA com o app (Vue 1): mesmas chaves do localStorage que ele usa
// (legacy/resources/assets/spa/js/services/jwt-token.js → 'token'; store/auth.js → 'user' em JSON).
// Como a tela nova é servida na MESMA origem (:8083), gravar aqui = o app abrir já logado.
import { chamar } from './api';

export const CHAVE_TOKEN = 'token';
export const CHAVE_USUARIO = 'user';
export const URL_DO_APP = '/app';
/** Depois de entrar ou se cadastrar: o mesmo destino do login do app (Login.vue → $router.go({ name: 'dashboard' })). */
export const ENTRADA_DO_APP = '/app#!/dashboard';

export interface Usuario {
  id: number;
  name: string;
  email: string;
  client_id: number;
  role?: string;
  [outros: string]: unknown;
}

export const tokenAtual = (armazenamento: Storage = localStorage): string | null => armazenamento.getItem(CHAVE_TOKEN);

/** Grava o token e o usuário (GET /api/user), como o login do app faz, para o menu dele mostrar o nome. */
export async function entrar(token: string, opcoes: { armazenamento?: Storage; fetch?: typeof fetch; base?: string } = {}): Promise<boolean> {
  const armazenamento = opcoes.armazenamento ?? localStorage;
  armazenamento.setItem(CHAVE_TOKEN, token);
  const r = await chamar<Usuario>('GET', '/user', { token, fetch: opcoes.fetch, base: opcoes.base });
  if (!r.ok) {
    sair({ armazenamento });
    return false;
  }
  armazenamento.setItem(CHAVE_USUARIO, JSON.stringify(r.dados));
  return true;
}

/**
 * Telas de admin (ADR-010): sem token → login; usuário que não é admin → acesso negado. É só a experiência da tela:
 * quem protege de fato é a API (403). O usuário vem do localStorage gravado por entrar().
 */
export function acessoAdmin(armazenamento: Storage = localStorage): 'login' | 'negado' | 'ok' {
  if (!tokenAtual(armazenamento)) return 'login';
  let usuario: Partial<Usuario> | null = null;
  try {
    usuario = JSON.parse(armazenamento.getItem(CHAVE_USUARIO) ?? 'null');
  } catch {
    usuario = null;
  }
  return usuario?.role === 'admin' ? 'ok' : 'negado';
}

/** Apaga a sessão local (o logout na API — blacklist do token — é chamado antes, pela página). */
export function sair(opcoes: { armazenamento?: Storage } = {}): void {
  const armazenamento = opcoes.armazenamento ?? localStorage;
  armazenamento.removeItem(CHAVE_TOKEN);
  armazenamento.removeItem(CHAVE_USUARIO);
}
