// REQ-CON-11 (ADR-004): interpretação do parâmetro `search` da listagem de contas.
// Vazio → sem filtro (o legado filtrava value = 0 — RN-CON-016). Com texto: OU entre
//   - texto contido no nome;
//   - período "dd/mm/aaaa-dd/mm/aaaa" (espaços em volta do hífen aceitos — é assim que a tela envia);
//   - valor em formato BR ("1.234,56"), só se a busca INTEIRA for um número (o legado lia o prefixo:
//     "01/01/2027-…" virava o valor 1 — efeito colateral de RN-CON-017 que não é mantido).

export interface Busca {
  texto?: string;
  periodo?: { inicio: string; fim: string }; // "aaaa-mm-dd"
  valorCentavos?: number;
}

const dataBR = (s: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};

export function interpretarBusca(valor: string | undefined | null): Busca | null {
  const texto = (valor ?? '').trim().slice(0, 100);
  if (!texto) return null;
  const busca: Busca = { texto };

  const partes = texto.split(/\s*-\s*/);
  if (partes.length === 2) {
    const [inicio, fim] = partes.map(dataBR);
    if (inicio && fim) busca.periodo = { inicio, fim };
  }

  const numeroBR = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;
  if (numeroBR.test(texto)) {
    const [inteiro, decimal = ''] = texto.replace(/\./g, '').split(',');
    busca.valorCentavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  }
  return busca;
}
