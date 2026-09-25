import { AsyncLocalStorage } from 'node:async_hooks';

/** Cliente da requisição atual (AsyncLocalStorage). Preenchido pelo ClienteInterceptor; lido pela extensão de tenant. */
const armazenamento = new AsyncLocalStorage<{ clienteId: number; usuarioId: number }>();

export const ContextoCliente = {
  executar<T>(dados: { clienteId: number; usuarioId: number }, fn: () => T): T {
    return armazenamento.run(dados, fn);
  },
  /**
   * Para código que devolve promessas do Prisma: elas são PREGUIÇOSAS (só executam no `.then`). Se o `await`
   * acontecer fora do escopo, a extensão de tenant não acha o cliente. Aqui o `await` fica dentro do escopo.
   */
  executarAsync<T>(dados: { clienteId: number; usuarioId: number }, fn: () => PromiseLike<T>): Promise<T> {
    return armazenamento.run(dados, async () => await fn());
  },
  atual(): { clienteId: number; usuarioId: number } | undefined {
    return armazenamento.getStore();
  },
};
