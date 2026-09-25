// Parâmetros do extrato em função pura (design §1): ordenação por allowlist (REQ-EXT-05) e período (REQ-EXT-03).
import { interpretarPeriodo } from '../../../shared/dominio/periodo';

/** REQ-EXT-04: 15 por página e ?limit ignorado, como no legado (paginate($limit = null)). */
export const POR_PAGINA = 15;

/** Chave que a TELA envia para ordenar por conta (sintaxe de join do prettus — StatementList.vue). */
export const CHAVE_ORDEM_POR_CONTA = 'bank_accounts:bank_account_id|bank_accounts.name';

/** orderBy aceito → o que ordenar. `date` e a chave de conta davam 500 no legado (RN-EXT-005). */
export const ORDENS = {
  id: 'id',
  value: 'value',
  balance: 'balance',
  bank_account_id: 'bankAccountId',
  date: 'createdAt',
  [CHAVE_ORDEM_POR_CONTA]: 'nomeDaConta',
} as const;

export type CampoDeOrdem = (typeof ORDENS)[keyof typeof ORDENS];
export type Sentido = 'asc' | 'desc';

export type ResultadoOrdem = { ordem: { campo: CampoDeOrdem; sentido: Sentido } } | { erros: Record<string, string[]> };

/** Sem orderBy → id asc (a ordem do legado). Fora da allowlist → erros no formato do Laravel (422). */
export function interpretarOrdem(orderBy: unknown, sortedBy: unknown): ResultadoOrdem {
  const chave = orderBy === undefined || orderBy === '' ? 'id' : orderBy;
  const sentido = sortedBy === undefined || sortedBy === '' ? 'asc' : sortedBy;
  const erros: Record<string, string[]> = {};
  // hasOwn (e não "in"): "constructor"/"toString" não podem virar campo (lição da revisão de contas)
  if (typeof chave !== 'string' || !Object.hasOwn(ORDENS, chave)) erros.orderBy = ['The selected order by is invalid.'];
  if (sentido !== 'asc' && sentido !== 'desc') erros.sortedBy = ['The selected sorted by is invalid.'];
  if (Object.keys(erros).length) return { erros };
  return { ordem: { campo: ORDENS[chave as keyof typeof ORDENS], sentido: sentido as Sentido } };
}

const ULTIMO_INSTANTE = new Date('9999-12-31T23:59:59.999Z');

export interface Intervalo {
  desde: Date; // inclusive, 00:00 UTC do 1º dia
  ate: Date; // EXCLUSIVE, 00:00 UTC do dia seguinte ao último
}

/**
 * `search` no formato de período da tela → intervalo sobre a data do LANÇAMENTO (REQ-EXT-03). Qualquer outra coisa
 * (vazio, texto, datas inválidas, fim antes do início) → null = sem filtro, como o legado.
 */
export function intervaloDoSearch(search: unknown): Intervalo | null {
  if (typeof search !== 'string') return null;
  const p = interpretarPeriodo(search);
  if (!p || p.fim < p.inicio) return null;
  const desde = new Date(`${p.inicio}T00:00:00Z`);
  const ate = new Date(`${p.fim}T00:00:00Z`);
  ate.setUTCDate(ate.getUTCDate() + 1);
  // 31/12/9999 + 1 dia = ano 10000, que o banco não aceita → 500 (revisão de segurança do extrato, X1)
  return { desde, ate: ate > ULTIMO_INSTANTE ? ULTIMO_INSTANTE : ate };
}
