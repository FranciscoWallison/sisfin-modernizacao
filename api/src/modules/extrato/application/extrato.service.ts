import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { intervaloDoSearch, interpretarOrdem } from '../domain/consulta';
import { ExtratoRepositorio } from '../infra/extrato.repositorio';

export interface ParametrosExtrato {
  pagina: number;
  orderBy: unknown;
  sortedBy: unknown;
  search: unknown;
  comConta: boolean;
}

@Injectable()
export class ExtratoService {
  constructor(private readonly repo: ExtratoRepositorio) {}

  async listar(clienteId: number, p: ParametrosExtrato) {
    const r = interpretarOrdem(p.orderBy, p.sortedBy);
    if ('erros' in r) throw new UnprocessableEntityException(r.erros); // legado: 500 (RN-EXT-005)
    return this.repo.listar(clienteId, p.pagina, r.ordem, intervaloDoSearch(p.search), p.comConta);
  }
}
