// REQ-CON-11 (ADR-004): interpretação do parâmetro `search` da listagem de contas.
// Vazio → sem filtro (o legado filtrava value = 0 — RN-CON-016). Com texto: OU entre
//   - texto contido no nome;
//   - período "dd/mm/aaaa-dd/mm/aaaa" (espaços em volta do hífen aceitos — é assim que a tela envia);
//   - valor em formato BR ("1.234,56"), só se a busca INTEIRA for um número (o legado lia o prefixo:
//     "01/01/2027-…" virava o valor 1 — efeito colateral de RN-CON-017 que não é mantido).

import { interpretarPeriodo } from '../../../shared/dominio/periodo';
import { TETO_CENTAVOS } from './dinheiro';

export interface Busca {
  texto?: string;
  periodo?: { inicio: string; fim: string }; // "aaaa-mm-dd"
  valorCentavos?: number;
}

export function interpretarBusca(valor: string | undefined | null): Busca | null {
  const texto = (valor ?? '').trim().slice(0, 100);
  if (!texto) return null;
  const busca: Busca = { texto };

  const periodo = interpretarPeriodo(texto); // parser compartilhado com o extrato (shared/dominio/periodo)
  if (periodo) busca.periodo = periodo;

  const numeroBR = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;
  if (numeroBR.test(texto)) {
    const [inteiro, decimal = ''] = texto.replace(/\./g, '').split(',');
    const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
    // acima do teto não existe conta com esse valor — e um número gigante virava "1e+99.00" e 500 no banco
    if (centavos <= TETO_CENTAVOS) busca.valorCentavos = centavos;
  }
  return busca;
}
