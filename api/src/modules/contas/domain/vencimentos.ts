// REQ-CON-03 / RN-CON-001..002: a conta informada + N repetições.
// A repetição n vence em (data original + n meses/anos), calculado SEMPRE a partir da data original;
// se o dia não existir no mês de destino, usa o último dia desse mês (legado: AbstractBill::addDate).

export const MENSAL = 1;
export const ANUAL = 2;

/** "2027-01-31", 3, MENSAL → ["2027-02-28", "2027-03-31", "2027-04-30"] (só as repetições, sem a original). */
export function vencimentosDasRepeticoes(dataOriginal: string, n: number, tipo: typeof MENSAL | typeof ANUAL): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataOriginal);
  if (!m) throw new Error(`data inválida: ${dataOriginal}`);
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const datas: string[] = [];
  for (let k = 1; k <= n; k++) {
    const mesesSomados = tipo === MENSAL ? k : 12 * k;
    const alvoAno = ano + Math.floor((mes + mesesSomados) / 12);
    const alvoMes = (mes + mesesSomados) % 12;
    const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(alvoAno, alvoMes, Math.min(dia, ultimoDia)));
    datas.push(d.toISOString().slice(0, 10));
  }
  return datas;
}
