// A02 — logo pelo conteúdo (REQ-ADB-04): assinatura, tamanho e nome removível. Unitário (domínio puro).
import { detectarImagem, logoRemovivel, TAMANHO_MAXIMO_LOGO, validarLogo } from '../src/modules/admin-bancos/domain/imagem';
import { JPEG, PNG, WEBP } from './fixtures/imagens';

describe('logo do banco (A02, domínio)', () => {
  it.each([
    ['PNG', PNG, 'png'],
    ['JPEG', JPEG, 'jpg'],
    ['WebP', WEBP, 'webp'],
  ])('%s é reconhecido pela assinatura', (_n, bytes, tipo) => {
    expect(detectarImagem(bytes)).toBe(tipo);
    expect(validarLogo(bytes)).toBe(tipo);
  });

  it.each([
    ['texto com extensão .png', Buffer.from('não sou imagem')],
    ['SVG (texto que pode levar script)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['vazio', Buffer.alloc(0)],
    ['PNG truncado', PNG.subarray(0, 7)],
    ['RIFF que não é WebP (WAV)', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
    ['GIF', Buffer.from('GIF89a')],
  ])('%s → recusado', (_n, bytes) => {
    expect(validarLogo(bytes)).toBeNull();
  });

  it('1 MB passa; 1 MB + 1 byte é recusado', () => {
    const limite = Buffer.concat([PNG, Buffer.alloc(TAMANHO_MAXIMO_LOGO - PNG.length)]);
    expect(validarLogo(limite)).toBe('png');
    expect(validarLogo(Buffer.concat([limite, Buffer.alloc(1)]))).toBeNull();
  });

  it.each([
    ['d3c886289b7dce323a950521d640b7f6.png', true],
    ['68c55efdd615dac5e1b92160d296e2f8.jpeg', true],
    ['default.jpg', false],
    ['../default.jpg', false],
    ['..', false],
    ['.htaccess', false],
    ['a/b.png', false],
    ['a\\b.png', false],
    ['', false],
  ])('nome removível: %s → %s', (nome, esperado) => {
    expect(logoRemovivel(nome)).toBe(esperado);
  });
});
