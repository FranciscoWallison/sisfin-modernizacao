// Dinheiro no domínio em CENTAVOS inteiros (nunca ponto flutuante — RN-CON-011 / REQ-CON-02).
// 999.999.999,99 = 99.999.999.999 centavos, bem abaixo de Number.MAX_SAFE_INTEGER.

export const TETO_CENTAVOS = 99_999_999_999;

/** "1234.5" | "1234.50" | 1234.5 → 123450. Lança se tiver mais de 2 casas. */
export function paraCentavos(valor: string | number): number {
  const texto = typeof valor === 'number' ? String(valor) : valor.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!m) throw new Error(`valor monetário inválido: ${texto}`);
  const centavos = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -centavos : centavos;
}

/** 123450 → "1234.50" (formato aceito pelo DECIMAL do banco). */
export function deCentavos(centavos: number): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
