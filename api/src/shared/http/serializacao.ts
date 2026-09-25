// Serialização compatível com o legado (contrato.md): datas no formato do Carbon serializado e dinheiro como número.

export interface DataCarbon {
  date: string;
  timezone_type: 3;
  timezone: 'UTC';
}

/** `2026-09-24T22:00:27Z` → `{ date: "2026-09-24 22:00:27.000000", timezone_type: 3, timezone: "UTC" }` */
export function dataCarbon(d: Date | null | undefined): DataCarbon | null {
  if (!d) return null;
  const iso = d.toISOString(); // 2026-09-24T22:00:27.000Z
  return { date: `${iso.slice(0, 10)} ${iso.slice(11, 19)}.000000`, timezone_type: 3, timezone: 'UTC' };
}

/** Coluna DATE → `"2027-01-31"` */
export function dataSimples(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Decimal (Prisma) ou string decimal → número JSON, só na borda HTTP (design §3). */
export function dinheiro(valor: { toString(): string } | string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  return Number(valor.toString());
}
