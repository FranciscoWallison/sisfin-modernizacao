import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { interpretarBusca } from '../domain/busca';
import { deCentavos, paraCentavos, TETO_CENTAVOS } from '../domain/dinheiro';
import { EstadoConta, Movimento, movimentos, TipoConta } from '../domain/movimentos';
import { MENSAL, vencimentosDasRepeticoes } from '../domain/vencimentos';
import { ContasRepositorio, ContasTransacao, DadosConta, FiltroLista } from '../infra/contas.repositorio';

export interface Contexto {
  clienteId: number;
  usuarioId: number;
}

export interface EntradaConta extends DadosConta {
  repeat?: boolean;
  repeatNumber?: number;
  repeatType?: 1 | 2;
}

const estado = (d: { value: string; done: boolean; bankAccountId: number }): EstadoConta => ({
  valor: paraCentavos(d.value),
  paga: d.done,
  contaBancaria: d.bankAccountId,
});

/** Orquestra domínio + repositório numa transação por operação (design §5, REQ-CON-06). */
@Injectable()
export class ContasService {
  constructor(private readonly repo: ContasRepositorio) {}

  /** Categoria do TIPO certo e conta bancária do cliente — antes de qualquer movimento (revisão de segurança #6). */
  private async validarReferencias(t: ContasTransacao, tipo: TipoConta, d: DadosConta): Promise<void> {
    const erros: Record<string, string[]> = {};
    if (!(await t.categoriaExiste(tipo, d.categoryId))) erros.category_id = ['The selected category id is invalid.'];
    if (!(await t.contaBancariaExiste(d.bankAccountId))) erros.bank_account_id = ['The selected bank account id is invalid.'];
    if (Object.keys(erros).length) throw new UnprocessableEntityException(erros);
  }

  /**
   * Passo 4 do design §5: trava as contas bancárias (em ordem de id) ANTES de gravar a conta. Gravar antes pega um
   * lock de FK (KEY SHARE) na conta bancária, e o FOR UPDATE depois precisaria "subir" esse lock → deadlock (40P01)
   * entre criações simultâneas — achado da revisão de segurança do código, confirmado por teste.
   */
  private travar(t: ContasTransacao, movs: Movimento[], ctx: Contexto): Promise<Map<number, string>> {
    return movs.length ? t.travarContasBancarias(movs.map((m) => m.contaBancaria), ctx.clienteId) : Promise.resolve(new Map());
  }

  /** Passos 5–6: aplica os deltas sobre os saldos já travados e registra o extrato. */
  private async aplicar(
    t: ContasTransacao, tipo: TipoConta, contaId: number, movs: Movimento[], saldos: Map<number, string>, ctx: Contexto,
  ): Promise<void> {
    for (const m of movs) {
      const atual = saldos.get(m.contaBancaria);
      if (atual === undefined) throw new UnprocessableEntityException({ bank_account_id: ['The selected bank account id is invalid.'] });
      const novo = paraCentavos(atual) + m.delta;
      if (Math.abs(novo) > TETO_CENTAVOS) throw new UnprocessableEntityException({ value: ['The resulting balance exceeds the allowed limit.'] });
      saldos.set(m.contaBancaria, deCentavos(novo));
      await t.atualizarSaldo(m.contaBancaria, deCentavos(novo));
      await t.registrarExtrato({
        tipo, contaId, contaBancaria: m.contaBancaria, valor: deCentavos(m.delta), saldo: deCentavos(novo),
        kind: m.kind, usuarioId: ctx.usuarioId, acao: m.acao,
      });
    }
  }

  criar(tipo: TipoConta, e: EntradaConta, ctx: Contexto) {
    return this.repo.transacao(async (t) => {
      const { repeat, repeatNumber, repeatType, ...dados } = e;
      await this.validarReferencias(t, tipo, dados);
      const movs = movimentos(tipo, null, estado(dados));
      const saldos = await this.travar(t, movs, ctx);
      const conta = await t.criarConta(tipo, dados);
      await this.aplicar(t, tipo, conta.id, movs, saldos, ctx);
      // REQ-CON-03: a conta informada + N repetições; REQ-CON-05: as repetições nascem EM ABERTO (corrige RN-CON-006)
      if (repeat) {
        for (const data of vencimentosDasRepeticoes(dados.dateDue, repeatNumber ?? 0, repeatType ?? MENSAL)) {
          await t.criarConta(tipo, { ...dados, dateDue: data, done: false });
        }
      }
      return conta;
    });
  }

  atualizar(tipo: TipoConta, id: number, dados: DadosConta, ctx: Contexto) {
    return this.repo.transacao(async (t) => {
      const antes = await t.travarConta(tipo, id, ctx.clienteId); // lock + releitura (revisão de segurança #1)
      if (!antes) throw new NotFoundException();
      await this.validarReferencias(t, tipo, dados);
      const movs = movimentos(tipo, { valor: paraCentavos(antes.valor), paga: antes.paga, contaBancaria: antes.contaBancaria }, estado(dados));
      const saldos = await this.travar(t, movs, ctx);
      const conta = await t.atualizarConta(tipo, id, dados);
      await this.aplicar(t, tipo, id, movs, saldos, ctx);
      return conta;
    });
  }

  excluir(tipo: TipoConta, id: number, ctx: Contexto) {
    return this.repo.transacao(async (t) => {
      const antes = await t.travarConta(tipo, id, ctx.clienteId);
      if (!antes) throw new NotFoundException();
      // REQ-CON-09: estorno com histórico preservado (corrige RN-CON-010)
      const movs = movimentos(tipo, { valor: paraCentavos(antes.valor), paga: antes.paga, contaBancaria: antes.contaBancaria }, null);
      const saldos = await this.travar(t, movs, ctx);
      await t.excluirConta(tipo, id);
      await this.aplicar(t, tipo, id, movs, saldos, ctx);
    });
  }

  async obter(tipo: TipoConta, id: number, incluirCategoria = false, incluirConta = false) {
    const conta = await this.repo.obter(tipo, id, incluirCategoria, incluirConta);
    if (!conta) throw new NotFoundException();
    return conta;
  }

  /** Listagem + bill_data com o MESMO filtro (REQ-CON-11/12, ADR-004). "Hoje" em UTC, como o legado. */
  async listar(
    tipo: TipoConta, search: string | undefined, pagina: number, limite: number,
    ordem: { campo: string; sentido: 'asc' | 'desc' }, incluirCategoria: boolean, incluirConta: boolean,
  ) {
    const busca = interpretarBusca(search);
    const filtro: FiltroLista | null = busca
      ? { texto: busca.texto, periodo: busca.periodo, valor: busca.valorCentavos !== undefined ? deCentavos(busca.valorCentavos) : undefined }
      : null;
    const hoje = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const [lista, pago, aPagar, vencido] = await Promise.all([
      this.repo.listar(tipo, filtro, pagina, limite, ordem, incluirCategoria, incluirConta),
      this.repo.somar(tipo, filtro, { done: true }),
      this.repo.somar(tipo, filtro, { done: false }),
      this.repo.somar(tipo, filtro, { done: false, dateDue: { lt: hoje } }),
    ]);
    return { ...lista, totais: { pago, aPagar, vencido } };
  }

  /** GET /total_today — soma do que vence hoje (UTC, como o legado). */
  totalHoje(tipo: TipoConta) {
    const hoje = new Date().toISOString().slice(0, 10);
    return this.repo.somar(tipo, null, { dateDue: new Date(`${hoje}T00:00:00Z`) });
  }

  /** GET /total_rest_of_month — de amanhã (ou hoje, se amanhã já for outro mês) até o fim do mês. */
  totalRestoDoMes(tipo: TipoConta) {
    const hoje = new Date();
    const amanha = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + 1));
    const inicio = amanha.getUTCMonth() !== hoje.getUTCMonth()
      ? new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()))
      : amanha;
    const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
    return this.repo.somar(tipo, null, { dateDue: { gte: inicio, lte: fim } });
  }
}
