import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { LOGO_PADRAO, MENSAGEM_LOGO_INVALIDO, TipoImagem, validarLogo } from '../domain/imagem';
import { ArquivosDeLogo } from '../infra/arquivos';
import { BancosRepositorio } from '../infra/bancos.repositorio';

// Admin de bancos (design §1, ADR-010). Ordem das escritas com arquivo (REQ-ADB-04):
//   grava o arquivo novo → grava o banco → remove o antigo.
// Se o banco falhar, o arquivo novo é removido (nada órfão no volume). O antigo só sai depois do commit, e nunca se
// for o padrão ou se outro banco ainda apontar para ele.

export const POR_PAGINA_ADMIN = 5; // RN-ADB-001

export const logoInvalido = () => new UnprocessableEntityException({ logo: [MENSAGEM_LOGO_INVALIDO] });
const EM_USO = () => new UnprocessableEntityException({ message: 'Bank has bank accounts.' });
const ehFkViolada = (e: unknown) => (e as { code?: unknown })?.code === 'P2003';

@Injectable()
export class AdminBancosService {
  constructor(
    private readonly repo: BancosRepositorio,
    private readonly arquivos: ArquivosDeLogo,
  ) {}

  listar(pagina: number) {
    return this.repo.pagina(pagina, POR_PAGINA_ADMIN);
  }

  async um(id: number) {
    const banco = await this.repo.porId(id);
    if (!banco) throw new NotFoundException();
    return banco;
  }

  async criar(name: string, logo?: Uint8Array) {
    const tipo = this.tipoDoLogo(logo);
    const arquivo = tipo ? await this.arquivos.gravar(logo!, tipo) : null;
    return this.comLimpeza(arquivo, () => this.repo.criar({ name, logo: arquivo ?? LOGO_PADRAO }));
  }

  async atualizar(id: number, name: string, logo?: Uint8Array) {
    const tipo = this.tipoDoLogo(logo);
    if (!(await this.repo.porId(id))) throw new NotFoundException(); // antes de gravar arquivo
    const arquivo = tipo ? await this.arquivos.gravar(logo!, tipo) : null;
    const { banco, antigo } = await this.comLimpeza(arquivo, () =>
      this.repo.transacao(async (t) => {
        const atual = await t.travar(id);
        if (!atual) throw new NotFoundException(); // excluído entre a checagem e a trava
        const trocou = arquivo !== null && atual.logo !== arquivo;
        if (trocou) await t.travarLogo(atual.logo); // antes de gravar: a outra transação vê o resultado ao seguir
        const banco = await t.atualizar(id, { name, ...(arquivo ? { logo: arquivo } : {}) });
        return { banco, antigo: trocou && !(await t.logoCompartilhado(atual.logo, id)) ? atual.logo : null };
      }),
    );
    if (antigo) await this.arquivos.remover(antigo);
    return banco;
  }

  async excluir(id: number): Promise<void> {
    let logo: string | null;
    try {
      logo = await this.repo.transacao(async (t) => {
        const atual = await t.travar(id);
        if (!atual) throw new NotFoundException();
        if (await t.emUso(id)) throw EM_USO(); // REQ-ADB-05 (legado: 500 de FK)
        await t.travarLogo(atual.logo);
        await t.excluir(id);
        return (await t.logoCompartilhado(atual.logo, id)) ? null : atual.logo;
      });
    } catch (e) {
      if (ehFkViolada(e)) throw EM_USO(); // conta bancária criada entre a checagem e o DELETE
      throw e;
    }
    if (logo) await this.arquivos.remover(logo);
  }

  /** Sem logo → null; logo que não é PNG/JPEG/WebP de até 1 MB → 422, antes de gravar qualquer coisa. */
  private tipoDoLogo(logo?: Uint8Array): TipoImagem | null {
    if (logo === undefined) return null;
    const tipo = validarLogo(logo);
    if (!tipo) throw logoInvalido();
    return tipo;
  }

  /** Executa a gravação no banco; se falhar, remove o arquivo novo (REQ-ADB-04: nada órfão no volume). */
  private async comLimpeza<T>(arquivo: string | null, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (arquivo) await this.arquivos.remover(arquivo);
      throw e;
    }
  }
}
