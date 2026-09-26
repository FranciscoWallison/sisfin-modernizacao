// Logo do banco (REQ-ADB-04, ADR-010): o tipo é decidido pelo CONTEÚDO (assinatura dos bytes iniciais), nunca pela
// extensão nem pelo Content-Type enviados. SVG não entra: é texto que pode levar script. Função pura.

export type TipoImagem = 'png' | 'jpg' | 'webp';

export const TAMANHO_MAXIMO_LOGO = 1024 * 1024; // 1 MB
export const LOGO_PADRAO = 'default.jpg'; // o logo de quem não enviou nenhum (BANK_LOGO_DEFAULT do legado)
export const MENSAGEM_LOGO_INVALIDO = 'The logo must be a PNG, JPEG or WebP image up to 1 MB.';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

const comeca = (b: Uint8Array, assinatura: number[], desde = 0) =>
  b.length >= desde + assinatura.length && assinatura.every((byte, i) => b[desde + i] === byte);

/** PNG, JPEG ou WebP pela assinatura; qualquer outra coisa (texto, SVG, vazio) → null. */
export function detectarImagem(b: Uint8Array): TipoImagem | null {
  if (comeca(b, PNG)) return 'png';
  if (comeca(b, JPEG)) return 'jpg';
  if (comeca(b, RIFF) && comeca(b, WEBP, 8)) return 'webp';
  return null;
}

/** Logo aceitável: imagem reconhecida e até 1 MB. Devolve o tipo (que dá a extensão do arquivo) ou null. */
export function validarLogo(b: Uint8Array): TipoImagem | null {
  if (b.length === 0 || b.length > TAMANHO_MAXIMO_LOGO) return null;
  return detectarImagem(b);
}

/**
 * Nome de arquivo que pode ser removido do diretório de logos: só um nome simples (sem barra, sem "..", sem começar
 * por ponto) e nunca o padrão. O valor vem da tabela `banks` — dado migrado do legado não é confiável.
 */
export function logoRemovivel(nome: string): boolean {
  return nome !== LOGO_PADRAO && /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]+)?$/.test(nome) && nome.length <= 255;
}
