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

// Banco e conta bancária no formato do legado (BankTransformer / BankAccountTransformer) — usados pelo compat (leitura)
// e pelo módulo contas-bancarias (escrita), para as duas saídas serem idênticas.

export interface BancoLido {
  id: number;
  name: string;
  logo: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ContaBancariaLida {
  id: number;
  name: string;
  agency: string | null;
  account: string | null;
  balance: { toString(): string } | string | number;
  default: boolean;
  bankId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  bank?: BancoLido | null;
}

/** logo = "<ASSETS_URL>/storage/banks/imagens/<arquivo>" (BankTransformer::makeLogoPath; base da config — REQ-CBA-07). */
export const banco = (b: BancoLido, urlArquivos: string) => ({
  id: b.id,
  name: b.name,
  logo: `${urlArquivos}/storage/banks/imagens/${b.logo}`,
  created_at: dataCarbon(b.createdAt),
  updated_at: dataCarbon(b.updatedAt),
});

/** `bank` só entra com include=bank (e então precisa da base dos arquivos). */
export const contaBancaria = (c: ContaBancariaLida, urlArquivos?: string) => ({
  id: c.id,
  name: c.name,
  agency: c.agency,
  account: c.account,
  balance: dinheiro(c.balance),
  default: c.default,
  bank_id: c.bankId,
  created_at: dataCarbon(c.createdAt),
  updated_at: dataCarbon(c.updatedAt),
  ...(c.bank && urlArquivos !== undefined ? { bank: { data: banco(c.bank, urlArquivos) } } : {}),
});
