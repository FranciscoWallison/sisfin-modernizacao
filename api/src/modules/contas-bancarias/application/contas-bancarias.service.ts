import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ContasBancariasRepositorio, ContasBancariasTransacao, DadosContaBancaria } from '../infra/contas-bancarias.repositorio';

// Escrita de contas bancárias (design §2): uma transação por operação. A troca da padrão acontece NA MESMA
// transação da gravação (o legado fazia num listener, depois do save — RN-CBA-002).

const BANCO_INVALIDO = () => new UnprocessableEntityException({ bank_id: ['The selected bank id is invalid.'] });
const TEM_LANCAMENTOS = () => new UnprocessableEntityException({ message: 'Bank account has entries.' });
const ehFkViolada = (e: unknown) => (e as { code?: unknown })?.code === 'P2003';

@Injectable()
export class ContasBancariasService {
  constructor(private readonly repo: ContasBancariasRepositorio) {}

  bancos() {
    return this.repo.bancos();
  }

  criar(d: DadosContaBancaria, clienteId: number) {
    return this.repo.transacao(async (t) => {
      if (!(await t.bancoExiste(d.bankId))) throw BANCO_INVALIDO(); // REQ-CBA-04 (legado: 500)
      await this.prepararPadrao(t, clienteId, null, d.default);
      return t.criar(d);
    });
  }

  atualizar(id: number, d: DadosContaBancaria, clienteId: number) {
    return this.repo.transacao(async (t) => {
      if (d.default) await t.travarTrocaDePadrao(clienteId);
      const travadas = await t.travar(clienteId, id, d.default);
      if (!travadas.includes(id)) throw new NotFoundException(); // REQ-CBA-06: alheia → nada é gravado
      if (!(await t.bancoExiste(d.bankId))) throw BANCO_INVALIDO();
      if (d.default) await t.desmarcarPadrao(id);
      return t.atualizar(id, d);
    });
  }

  async excluir(id: number, clienteId: number): Promise<void> {
    try {
      await this.repo.transacao(async (t) => {
        if (!(await t.travar(clienteId, id, false)).includes(id)) throw new NotFoundException();
        if (await t.temLancamentos(id)) throw TEM_LANCAMENTOS(); // REQ-CBA-05 (legado: 500)
        await t.excluir(id);
      });
    } catch (e) {
      if (ehFkViolada(e)) throw TEM_LANCAMENTOS(); // lançamento entrou entre a checagem e o DELETE
      throw e;
    }
  }

  /** default = true: serializa as trocas do cliente, trava as padrão atuais (ordem de id) e as desmarca. */
  private async prepararPadrao(t: ContasBancariasTransacao, clienteId: number, id: number | null, padrao: boolean) {
    if (!padrao) return;
    await t.travarTrocaDePadrao(clienteId);
    await t.travar(clienteId, id, true);
    await t.desmarcarPadrao(id);
  }
}
