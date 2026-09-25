// Árvore de categorias de UM cliente, em função pura (design §2). O nested set (_lft/_rgt) é derivado de parent_id:
// depois de cada escrita, a numeração do cliente é recalculada (numerar). Raízes e irmãs em ordem de id (RN-CAT-011).

export type TipoArvore = 'receita' | 'despesa';

/** Categoria como o repositório devolve (tipo puro — sem Prisma). */
export interface Categoria {
  id: number;
  name: string;
  parentId: number | null;
  lft: number;
  rgt: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface No {
  id: number;
  parentId: number | null;
}

export interface Numeracao {
  lft: number;
  rgt: number;
}

/** Árvore que não é floresta: ciclo ou parent_id fora do conjunto do cliente (órfã / pai de outro cliente). */
export class ArvoreInvalida extends Error {}

function filhosPorPai(nos: readonly No[]): Map<number | null, number[]> {
  const ids = new Set(nos.map((n) => n.id));
  const filhos = new Map<number | null, number[]>();
  for (const n of nos) {
    if (n.parentId !== null && !ids.has(n.parentId)) {
      throw new ArvoreInvalida(`categoria ${n.id}: pai ${n.parentId} fora da árvore do cliente`);
    }
    agrupar(filhos, n.parentId, n.id);
  }
  for (const lista of filhos.values()) lista.sort((a, b) => a - b);
  return filhos;
}

/** push no array existente — copiar a cada nó era O(n²) em irmãs (revisão de segurança S1: 10 s com 30k). */
function agrupar<K, V>(mapa: Map<K, V[]>, chave: K, valor: V): void {
  const lista = mapa.get(chave);
  if (lista) lista.push(valor);
  else mapa.set(chave, [valor]);
}

/** lft/rgt de cada nó, começando em 1, em DFS com raízes e irmãs em ordem de id. */
export function numerar(nos: readonly No[]): Map<number, Numeracao> {
  const filhos = filhosPorPai(nos);
  const saida = new Map<number, Numeracao>();
  let contador = 1;
  // iterativo: profundidade não limitada pela pilha de chamadas
  const pilha: { id: number; aberto: boolean }[] = (filhos.get(null) ?? []).map((id) => ({ id, aberto: false })).reverse();
  while (pilha.length) {
    const topo = pilha.pop()!;
    if (topo.aberto) {
      saida.get(topo.id)!.rgt = contador++;
      continue;
    }
    saida.set(topo.id, { lft: contador++, rgt: 0 });
    pilha.push({ id: topo.id, aberto: true });
    for (const f of [...(filhos.get(topo.id) ?? [])].reverse()) pilha.push({ id: f, aberto: false });
  }
  // nó não visitado a partir das raízes = está num ciclo
  if (saida.size !== nos.length) {
    const fora = nos.filter((n) => !saida.has(n.id)).map((n) => n.id);
    throw new ArvoreInvalida(`ciclo na árvore: categorias ${fora.join(', ')}`);
  }
  return saida;
}

/** Descendentes de `id` (sem ele). Numa árvore com ciclo, para ao revisitar. */
export function descendentes(nos: readonly No[], id: number): Set<number> {
  const filhos = new Map<number, number[]>();
  for (const n of nos) if (n.parentId !== null) agrupar(filhos, n.parentId, n.id);
  const saida = new Set<number>();
  const fila = [...(filhos.get(id) ?? [])];
  for (let i = 0; i < fila.length; i++) { // fila com índice: shift() é O(n) (S1)
    const atual = fila[i];
    if (saida.has(atual) || atual === id) continue;
    saida.add(atual);
    for (const f of filhos.get(atual) ?? []) fila.push(f); // sem spread: 100k irmãs estourariam os argumentos
  }
  return saida;
}

/** Mover `id` para debaixo de `novoPai` cria ciclo? (o próprio nó ou um descendente dele) — REQ-CAT-04. */
export function criaCiclo(nos: readonly No[], id: number, novoPai: number | null): boolean {
  return novoPai !== null && (novoPai === id || descendentes(nos, id).has(novoPai));
}

/** Nós cuja numeração mudou (para atualizar só essas linhas). */
export function numeracaoAlterada(
  atuais: ReadonlyMap<number, Numeracao>,
  nova: ReadonlyMap<number, Numeracao>,
): { id: number; lft: number; rgt: number }[] {
  const saida: { id: number; lft: number; rgt: number }[] = [];
  for (const [id, n] of nova) {
    const a = atuais.get(id);
    if (!a || a.lft !== n.lft || a.rgt !== n.rgt) saida.push({ id, ...n });
  }
  return saida.sort((x, y) => x.id - y.id);
}

export interface NoDaArvore<T> {
  item: T;
  depth: number;
  children: NoDaArvore<T>[];
}

/**
 * Monta a árvore para a resposta (depth + children recursivo), ordem de id. `raiz` = null → a floresta inteira;
 * senão, a subárvore daquele nó com o depth ABSOLUTO (como o withDepth do legado).
 * ITERATIVO e linear: a versão recursiva estourava a pilha com 5.000 níveis (revisão de segurança S6).
 */
export function montar<T extends No>(itens: readonly T[], raiz: number | null = null): NoDaArvore<T>[] {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const filhos = new Map<number | null, T[]>();
  for (const i of [...itens].sort((a, b) => a.id - b.id)) agrupar(filhos, i.parentId, i);
  const profundidade = (id: number) => {
    let d = 0;
    const vistos = new Set<number>();
    for (let p = porId.get(id)?.parentId ?? null; p !== null && !vistos.has(p); p = porId.get(p)?.parentId ?? null) {
      vistos.add(p);
      d++;
    }
    return d;
  };
  const visitados = new Set<number>(); // cada nó entra uma vez: um ciclo no dado não vira laço infinito
  const construir = (topo: T, depthTopo: number): NoDaArvore<T> => {
    const noTopo: NoDaArvore<T> = { item: topo, depth: depthTopo, children: [] };
    visitados.add(topo.id);
    const pilha: NoDaArvore<T>[] = [noTopo];
    while (pilha.length) {
      const pai = pilha.pop()!;
      for (const f of filhos.get(pai.item.id) ?? []) {
        if (visitados.has(f.id)) continue;
        visitados.add(f.id);
        const no: NoDaArvore<T> = { item: f, depth: pai.depth + 1, children: [] };
        pai.children.push(no); // filhos já em ordem de id; a ordem de visita da pilha não altera a de children
        pilha.push(no);
      }
    }
    return noTopo;
  };
  if (raiz === null) return (filhos.get(null) ?? []).map((i) => construir(i, 0));
  const alvo = porId.get(raiz);
  return alvo ? [construir(alvo, profundidade(raiz))] : [];
}

/**
 * Percorre a árvore montada e transforma cada nó SEM recursão (a serialização recursiva também estourava a pilha
 * — S6). `formatar` recebe o nó e o array dos filhos transformados e deve embutir ESSE array (por referência):
 * ele é preenchido depois, na ordem de id.
 */
export function transformar<T, R>(nos: NoDaArvore<T>[], formatar: (no: NoDaArvore<T>, filhos: R[]) => R): R[] {
  const saidaRaiz: R[] = [];
  const pilha: { no: NoDaArvore<T>; destino: R[] }[] = nos.map((no) => ({ no, destino: saidaRaiz })).reverse();
  const destinos: { no: NoDaArvore<T>; destino: R[]; filhos: R[] }[] = [];
  // 1ª passada (pré-ordem): cria o array de filhos de cada nó; 2ª (pós-ordem, ao contrário): formata
  while (pilha.length) {
    const { no, destino } = pilha.pop()!;
    const filhos: R[] = [];
    destinos.push({ no, destino, filhos });
    for (let i = no.children.length - 1; i >= 0; i--) pilha.push({ no: no.children[i], destino: filhos });
  }
  const formatados = new Map<NoDaArvore<T>, R>();
  for (let i = destinos.length - 1; i >= 0; i--) formatados.set(destinos[i].no, formatar(destinos[i].no, destinos[i].filhos));
  // pré-ordem: o pai vem antes dos filhos, e irmãs em ordem → encaixar na mesma ordem preserva a ordem de id
  for (const d of destinos) d.destino.push(formatados.get(d.no)!);
  return saidaRaiz;
}
