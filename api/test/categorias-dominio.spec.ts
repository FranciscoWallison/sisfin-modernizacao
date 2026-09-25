// G02 — árvore de categorias em função pura (design §2): numeração nested set a partir de parent_id, ciclo,
// descendentes e montagem da resposta na ordem do legado (RN-CAT-011).
import { ArvoreInvalida, criaCiclo, descendentes, montar, No, numeracaoAlterada, numerar } from '../src/modules/categorias/domain/arvore';

// R(1) ─ A(2) ─ N(4)
//      └ B(3)
// S(5)
const floresta: No[] = [
  { id: 3, parentId: 1 },
  { id: 1, parentId: null },
  { id: 5, parentId: null },
  { id: 4, parentId: 2 },
  { id: 2, parentId: 1 },
];

/** Invariantes de um nested set válido, conferidos contra parent_id. */
function conferirInvariantes(nos: No[], num: Map<number, { lft: number; rgt: number }>) {
  const valores = [...num.values()].flatMap((n) => [n.lft, n.rgt]).sort((a, b) => a - b);
  expect(valores).toEqual(Array.from({ length: nos.length * 2 }, (_, i) => i + 1)); // contíguos, sem repetição
  const porId = new Map(nos.map((n) => [n.id, n]));
  for (const a of nos) {
    const na = num.get(a.id)!;
    expect(na.lft).toBeLessThan(na.rgt);
    for (const b of nos) {
      if (a.id === b.id) continue;
      const nb = num.get(b.id)!;
      // b dentro de a  ⇔  a é ancestral de b
      let ancestral = false;
      for (let p = porId.get(b.id)!.parentId; p !== null; p = porId.get(p)!.parentId) if (p === a.id) ancestral = true;
      expect(nb.lft > na.lft && nb.rgt < na.rgt).toBe(ancestral);
    }
  }
}

describe('numerar', () => {
  it('DFS com raízes e irmãs em ordem de id, começando em 1', () => {
    const n = numerar(floresta);
    expect(Object.fromEntries(n)).toEqual({
      1: { lft: 1, rgt: 8 },
      2: { lft: 2, rgt: 5 },
      4: { lft: 3, rgt: 4 },
      3: { lft: 6, rgt: 7 },
      5: { lft: 9, rgt: 10 },
    });
    conferirInvariantes(floresta, n);
  });

  it('árvore vazia → numeração vazia', () => {
    expect(numerar([]).size).toBe(0);
  });

  it('pai fora do conjunto do cliente (órfã ou pai de outro cliente) → ArvoreInvalida', () => {
    expect(() => numerar([{ id: 1, parentId: 99 }])).toThrow(ArvoreInvalida);
  });

  it('ciclo → ArvoreInvalida (sem laço infinito)', () => {
    expect(() => numerar([{ id: 1, parentId: null }, { id: 2, parentId: 3 }, { id: 3, parentId: 2 }])).toThrow(/ciclo/);
    expect(() => numerar([{ id: 7, parentId: 7 }])).toThrow(ArvoreInvalida);
  });

  it('profundidade grande não estoura a pilha (iterativo)', () => {
    const corrente: No[] = Array.from({ length: 20_000 }, (_, i) => ({ id: i + 1, parentId: i === 0 ? null : i }));
    const n = numerar(corrente);
    expect(n.get(1)).toEqual({ lft: 1, rgt: 40_000 });
    expect(n.get(20_000)).toEqual({ lft: 20_000, rgt: 20_001 });
  });

  it('invariantes valem para 200 florestas aleatórias (semente fixa)', () => {
    let semente = 42;
    const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let rodada = 0; rodada < 200; rodada++) {
      const tamanho = 1 + Math.floor(aleatorio() * 25);
      const ids = Array.from({ length: tamanho }, (_, i) => i + 1).sort(() => aleatorio() - 0.5);
      // cada nó aponta para um anterior na permutação (ou é raiz) → floresta sem ciclo
      const nos = ids.map((id, i) => ({ id, parentId: i === 0 || aleatorio() < 0.3 ? null : ids[Math.floor(aleatorio() * i)] }));
      conferirInvariantes(nos, numerar(nos));
    }
  });
});

describe('descendentes e ciclo (REQ-CAT-04)', () => {
  it('descendentes não inclui o próprio nó', () => {
    expect([...descendentes(floresta, 1)].sort()).toEqual([2, 3, 4]);
    expect(descendentes(floresta, 4).size).toBe(0);
  });

  it('pai = ela mesma ou uma descendente → ciclo; outro ramo ou raiz → não', () => {
    expect(criaCiclo(floresta, 1, 1)).toBe(true);
    expect(criaCiclo(floresta, 1, 4)).toBe(true); // raiz dentro da neta
    expect(criaCiclo(floresta, 2, 3)).toBe(false); // irmã
    expect(criaCiclo(floresta, 4, 5)).toBe(false); // outra árvore
    expect(criaCiclo(floresta, 2, null)).toBe(false); // virar raiz
  });
});

describe('numeracaoAlterada', () => {
  it('só as linhas cuja numeração mudou, em ordem de id', () => {
    const antes = new Map([[1, { lft: 1, rgt: 4 }], [2, { lft: 2, rgt: 3 }], [3, { lft: 50, rgt: 51 }]]);
    const depois = new Map([[1, { lft: 1, rgt: 4 }], [2, { lft: 2, rgt: 3 }], [3, { lft: 5, rgt: 6 }], [9, { lft: 7, rgt: 8 }]]);
    expect(numeracaoAlterada(antes, depois)).toEqual([{ id: 3, lft: 5, rgt: 6 }, { id: 9, lft: 7, rgt: 8 }]);
  });
});

describe('montar (resposta)', () => {
  const itens = floresta.map((n) => ({ ...n, name: `c${n.id}` }));
  const ids = (nos: ReturnType<typeof montar>): unknown => nos.map((n) => [n.item.id, n.depth, ids(n.children)]);

  it('floresta: raízes e filhas em ordem de id, depth a partir de 0', () => {
    expect(ids(montar(itens))).toEqual([[1, 0, [[2, 1, [[4, 2, []]]], [3, 1, []]]], [5, 0, []]]);
  });

  it('subárvore com depth ABSOLUTO (como o withDepth do legado)', () => {
    expect(ids(montar(itens, 2))).toEqual([[2, 1, [[4, 2, []]]]]);
    expect(ids(montar(itens, 4))).toEqual([[4, 2, []]]);
  });

  it('id inexistente → vazio', () => {
    expect(montar(itens, 99)).toEqual([]);
  });

  it('ordem por id mesmo quando o id maior foi criado primeiro na lista (RN-CAT-011)', () => {
    const ordem = montar([{ id: 10, parentId: null }, { id: 3, parentId: null }, { id: 7, parentId: null }]).map((n) => n.item.id);
    expect(ordem).toEqual([3, 7, 10]);
  });
});
