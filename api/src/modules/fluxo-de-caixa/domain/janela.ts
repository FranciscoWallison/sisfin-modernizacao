// Janelas do fluxo de caixa (design §2). Função pura, tudo em UTC como o legado. Datas "aaaa-mm-dd", intervalos inclusivos.
//
//  - janelaMensal: início = mês atual (ou ?start=aaaa-mm), fim = +10 meses (REQ-FLX-02 — o legado fixava fev/2018);
//    "primeiro mês" = mês anterior INTEIRO (REQ-FLX-04 — o legado olhava só o último dia);
//    corte do saldo = extratos lançados ANTES do primeiro dia do "primeiro mês" (REQ-FLX-06 — o legado cortava às 00:00
//    do último dia do mês anterior, perdendo os lançamentos daquele dia).
//  - janelaDiaria: hoje até hoje + 30 dias (REQ-FLX-01).

export interface Intervalo {
  inicio: string;
  fim: string;
}

export interface JanelaMensal extends Intervalo {
  primeiroMes: Intervalo;
  corteSaldo: string;
}

export class MesInvalidoError extends Error {}

const iso = (ano: number, mes0: number, dia: number) => new Date(Date.UTC(ano, mes0, dia)).toISOString().slice(0, 10);

export function janelaMensal(hoje: string, start?: string): JanelaMensal {
  let ano: number;
  let mes0: number;
  if (start !== undefined) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(start);
    // Date.UTC trata anos < 100 como 1900+ano ("0050-06" viraria 1950) — faixa fechada (revisão do módulo)
    if (!m || Number(m[1]) < 1900 || Number(m[1]) > 2100) throw new MesInvalidoError(`mês inválido: ${start}`);
    ano = Number(m[1]);
    mes0 = Number(m[2]) - 1;
  } else {
    ano = Number(hoje.slice(0, 4));
    mes0 = Number(hoje.slice(5, 7)) - 1;
  }
  const primeiroMes = { inicio: iso(ano, mes0 - 1, 1), fim: iso(ano, mes0, 0) }; // dia 0 = último dia do mês anterior
  return {
    inicio: iso(ano, mes0, 1),
    fim: iso(ano, mes0 + 11, 0), // último dia do mês (início + 10 meses)
    primeiroMes,
    corteSaldo: primeiroMes.inicio,
  };
}

export function janelaDiaria(hoje: string): Intervalo {
  const [a, m, d] = hoje.split('-').map(Number);
  return { inicio: hoje, fim: iso(a, m - 1, d + 30) };
}
