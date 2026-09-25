import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Categoria, criaCiclo, descendentes, montar, No, NoDaArvore, numeracaoAlterada, numerar, TipoArvore } from '../domain/arvore';
import { CategoriasRepositorio, CategoriasTransacao } from '../infra/categorias.repositorio';

// Escrita das categorias (design §3): uma transação por operação, com advisory lock da árvore do cliente.
// Ordem das checagens como o legado: validação do corpo (pipe) → parent_id (422) → id da rota (404) → ciclo (422).

const PAI_INVALIDO = () => new UnprocessableEntityException({ parent_id: ['The selected parent id is invalid.'] });
const TEM_CONTAS = () => new UnprocessableEntityException({ message: 'Category has bills.' });

export interface EntradaCategoria {
  name: string;
  parentId: number | null;
}

/** Violação de FK (bill_* → categoria): uma conta entrou entre a checagem e o DELETE. */
const ehFkViolada = (e: unknown) => (e as { code?: unknown })?.code === 'P2003';

@Injectable()
export class CategoriasService {
  constructor(private readonly repo: CategoriasRepositorio) {}

  /** Floresta do cliente, raízes e filhas em ordem de id (REQ-CAT-08). */
  async listar(tipo: TipoArvore): Promise<NoDaArvore<Categoria>[]> {
    return montar(await this.repo.categorias(tipo));
  }

  async obter(tipo: TipoArvore, id: number): Promise<NoDaArvore<Categoria>> {
    const [no] = montar(await this.repo.categorias(tipo), id);
    if (!no) throw new NotFoundException();
    return no;
  }

  criar(tipo: TipoArvore, e: EntradaCategoria, clienteId: number) {
    return this.repo.transacao(async (t) => {
      const atuais = await this.travarECarregar(t, tipo, clienteId);
      if (e.parentId !== null && !atuais.some((c) => c.id === e.parentId)) throw PAI_INVALIDO();
      const nova = await t.criar(tipo, e);
      return this.renumerarEResponder(t, tipo, clienteId, [...atuais, nova], nova.id);
    });
  }

  atualizar(tipo: TipoArvore, id: number, e: EntradaCategoria, clienteId: number) {
    return this.repo.transacao(async (t) => {
      const atuais = await this.travarECarregar(t, tipo, clienteId);
      if (e.parentId !== null && !atuais.some((c) => c.id === e.parentId)) throw PAI_INVALIDO(); // REQ-CAT-02
      if (!atuais.some((c) => c.id === id)) throw new NotFoundException(); // REQ-CAT-03: alheia → nada é gravado
      if (criaCiclo(atuais, id, e.parentId)) throw PAI_INVALIDO(); // REQ-CAT-04
      const atualizada = await t.atualizar(tipo, id, e);
      return this.renumerarEResponder(t, tipo, clienteId, atuais.map((c) => (c.id === id ? atualizada : c)), id);
    });
  }

  async excluir(tipo: TipoArvore, id: number, clienteId: number): Promise<void> {
    try {
      await this.repo.transacao(async (t) => {
        const atuais = await this.travarECarregar(t, tipo, clienteId);
        if (!atuais.some((c) => c.id === id)) throw new NotFoundException();
        const subarvore = [id, ...descendentes(atuais, id)];
        if (await t.temContas(tipo, subarvore)) throw TEM_CONTAS(); // REQ-CAT-05: tudo ou nada
        await t.excluir(tipo, subarvore);
        const restantes = atuais.filter((c) => !subarvore.includes(c.id));
        await t.renumerar(tipo, clienteId, numeracaoAlterada(this.numeracaoAtual(restantes), numerar(restantes)));
      });
    } catch (e) {
      if (ehFkViolada(e)) throw TEM_CONTAS();
      throw e;
    }
  }

  private async travarECarregar(t: CategoriasTransacao, tipo: TipoArvore, clienteId: number): Promise<Categoria[]> {
    await t.travarArvore(tipo, clienteId);
    return t.categorias(tipo);
  }

  private numeracaoAtual(categorias: Categoria[]) {
    return new Map(categorias.map((c) => [c.id, { lft: c.lft, rgt: c.rgt }]));
  }

  /** Renumera o nested set do cliente a partir de parent_id e devolve a subárvore de `id` para a resposta. */
  private async renumerarEResponder(
    t: CategoriasTransacao, tipo: TipoArvore, clienteId: number, categorias: Categoria[], id: number,
  ): Promise<NoDaArvore<Categoria>> {
    const nos: No[] = categorias.map((c) => ({ id: c.id, parentId: c.parentId }));
    const nova = numerar(nos); // árvore inválida (dado corrompido) → ArvoreInvalida → 500 e rollback
    await t.renumerar(tipo, clienteId, numeracaoAlterada(this.numeracaoAtual(categorias), nova));
    const [no] = montar(categorias.map((c) => ({ ...c, ...nova.get(c.id)! })), id);
    return no;
  }
}
