// Tabela de movimentos de saldo (design §5). Função PURA: recebe o estado antes/depois de uma conta e devolve os
// lançamentos que as contas bancárias devem receber. Valores em centavos.
//
// | antes → depois                    | conta a pagar (a receber inverte o sinal) | regra            |
// |-----------------------------------|--------------------------------------------|------------------|
// | null → aberta                     | nada                                       |                  |
// | null → paga                       | −valor                                     | REQ-CON-05       |
// | aberta → paga                     | −valor                                     | REQ-CON-04       |
// | paga → paga, valor mudou          | antigo − novo                              | REQ-CON-04       |
// | paga → aberta                     | +antigo                                    | REQ-CON-04       |
// | paga (conta A) → paga (conta B)   | +antigo em A, −novo em B                   | REQ-CON-08 (corr)|
// | paga → null (exclusão)            | +antigo, tipo "estorno"                    | REQ-CON-09 (corr)|

export type TipoConta = 'pagar' | 'receber';
export type Acao = 'criacao' | 'pagamento' | 'alteracao' | 'estorno' | 'exclusao';

export interface EstadoConta {
  valor: number; // centavos, > 0
  paga: boolean;
  contaBancaria: number;
}

export interface Movimento {
  contaBancaria: number;
  delta: number; // centavos; negativo = sai dinheiro da conta bancária
  kind: 'movimento' | 'estorno';
  acao: Acao;
}

export function movimentos(tipo: TipoConta, antes: EstadoConta | null, depois: EstadoConta | null): Movimento[] {
  const sinal = tipo === 'pagar' ? -1 : 1; // pagar tira dinheiro; receber entra dinheiro
  const efeito = (e: EstadoConta) => sinal * e.valor; // impacto no saldo de uma conta PAGA
  const saida: Movimento[] = [];
  const lancar = (contaBancaria: number, delta: number, kind: Movimento['kind'], acao: Acao) => {
    if (delta !== 0) saida.push({ contaBancaria, delta, kind, acao });
  };

  const pagoAntes = antes?.paga ? antes : null;
  const pagoDepois = depois?.paga ? depois : null;

  if (!pagoAntes && !pagoDepois) return saida; // nada pago antes nem depois: saldo não muda

  if (!pagoAntes && pagoDepois) {
    lancar(pagoDepois.contaBancaria, efeito(pagoDepois), 'movimento', antes ? 'pagamento' : 'criacao');
  } else if (pagoAntes && !pagoDepois) {
    // desmarcou (estorno) ou excluiu a conta paga
    lancar(pagoAntes.contaBancaria, -efeito(pagoAntes), 'estorno', depois ? 'estorno' : 'exclusao');
  } else if (pagoAntes && pagoDepois) {
    if (pagoAntes.contaBancaria === pagoDepois.contaBancaria) {
      lancar(pagoDepois.contaBancaria, efeito(pagoDepois) - efeito(pagoAntes), 'movimento', 'alteracao');
    } else {
      // mudou de conta bancária: devolve na antiga, aplica na nova (o legado não mexia em nenhuma — RN-CON-009)
      lancar(pagoAntes.contaBancaria, -efeito(pagoAntes), 'estorno', 'alteracao');
      lancar(pagoDepois.contaBancaria, efeito(pagoDepois), 'movimento', 'alteracao');
    }
  }
  return saida;
}
