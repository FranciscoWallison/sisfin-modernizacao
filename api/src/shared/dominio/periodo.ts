// Período no formato que as telas do SPA enviam no `search`: "dd/mm/aaaa - dd/mm/aaaa" (espaços em volta do hífen
// aceitos). Usado pela listagem de contas (REQ-CON-11 / ADR-004) e pelo extrato (REQ-EXT-03 / ADR-008).

export interface Periodo {
  inicio: string; // "aaaa-mm-dd"
  fim: string; // "aaaa-mm-dd"
}

/** "31/01/2027" → "2027-01-31"; data que não existe no calendário (31/02) → null. */
export function dataBR(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** O texto inteiro é um período válido? Senão null (texto livre, datas inválidas, mais de um hífen…). */
export function interpretarPeriodo(texto: string | undefined | null): Periodo | null {
  const partes = (texto ?? '').trim().slice(0, 100).split(/\s*-\s*/);
  if (partes.length !== 2) return null;
  const [inicio, fim] = partes.map(dataBR);
  return inicio && fim ? { inicio, fim } : null;
}
