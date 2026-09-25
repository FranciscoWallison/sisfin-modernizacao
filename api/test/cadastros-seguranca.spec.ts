// G06/B07 — achados da revisão de segurança dos módulos categorias e contas-bancarias
// (docs/revisoes/2026-09-25-security-categorias-contas-bancarias.md). Cada hipótese do revisor virou um teste que
// falhou antes da correção.
import { UnprocessableEntityException } from '@nestjs/common';
import { descendentes, montar, No, numerar } from '../src/modules/categorias/domain/arvore';
import { CategoriaDto } from '../src/modules/categorias/http/categoria.dto';
import { serializarCategorias } from '../src/modules/categorias/http/categorias.controller';
import { ContaBancariaDto } from '../src/modules/contas-bancarias/http/conta-bancaria.dto';
import { CHAVES_ADVISORY_LOCK } from '../src/shared/prisma/chaves-lock';
import { criarValidationPipe } from '../src/shared/http/validacao';

const pipe = criarValidationPipe();
const validar = (tipo: new () => unknown, corpo: unknown) => pipe.transform(corpo, { type: 'body', metatype: tipo });
const status = async (tipo: new () => unknown, corpo: unknown) => {
  try {
    await validar(tipo, corpo);
    return 200;
  } catch (e) {
    return e instanceof UnprocessableEntityException ? 422 : 500;
  }
};
const conta = { name: 'Conta', agency: '1', account: '2', bank_id: 1 };

describe('S1 — árvore grande não trava o event loop (custo linear)', () => {
  const raizes: No[] = Array.from({ length: 30_000 }, (_, i) => ({ id: i + 1, parentId: null }));
  const irmas: No[] = [{ id: 1, parentId: null }, ...Array.from({ length: 30_000 }, (_, i) => ({ id: i + 2, parentId: 1 }))];

  it.each([['30k raízes', raizes], ['30k irmãs sob um pai', irmas]])('numerar + montar + descendentes com %s em < 300 ms', (_n, nos) => {
    const inicio = performance.now();
    numerar(nos);
    montar(nos);
    descendentes(nos, 1);
    expect(performance.now() - inicio).toBeLessThan(300);
  });
});

describe('S6 — cadeia profunda não estoura a pilha nem é quadrática', () => {
  const cadeia = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1, parentId: i === 0 ? null : i, name: `n${i}`, lft: 0, rgt: 0, createdAt: null, updatedAt: null,
    }));

  it('montar + serializar (código nosso) uma cadeia de 5.000 níveis em < 300 ms, sem recursão', () => {
    const inicio = performance.now();
    const [raiz] = serializarCategorias(montar(cadeia(5_000))) as { children: { data: unknown[] } }[];
    expect(raiz.children.data).toHaveLength(1);
    expect(performance.now() - inicio).toBeLessThan(300);
  });

  // O teto que sobra é o do JSON.stringify do V8 (quebra entre 1.000 e 2.000 níveis). O LEGADO quebra em 170
  // (sonda de 25/09: json_encode com profundidade 512 → 500 na árvore inteira). Limite de profundidade = DUV-CAT-007.
  it('a resposta JSON sai com 1.000 níveis (o legado só serve até 169)', () => {
    expect(() => JSON.stringify({ data: serializarCategorias(montar(cadeia(1_000))) })).not.toThrow();
  });

  it('a ordem e o depth continuam os da versão recursiva (floresta com irmãs fora de ordem)', () => {
    const itens = [5, 1, 3, 2, 4].map((id) => ({ id, parentId: id === 1 || id === 5 ? null : id === 4 ? 2 : 1, name: `c${id}`, lft: 0, rgt: 0, createdAt: null, updatedAt: null }));
    const resumo = (nos: unknown[]): unknown =>
      (nos as { id: number; depth: number; children: { data: unknown[] } }[]).map((n) => [n.id, n.depth, resumo(n.children.data)]);
    expect(resumo(serializarCategorias(montar(itens)))).toEqual([[1, 0, [[2, 1, [[4, 2, []]]], [3, 1, []]]], [5, 0, []]]);
  });
});

describe('S3 — ids fora do int4 viram 422 no corpo (não 500 no banco)', () => {
  it.each([2147483648, 1e20])('bank_id %p → 422', async (bank_id) => {
    expect(await status(ContaBancariaDto, { ...conta, bank_id })).toBe(422);
  });
  it.each([2147483648, 0, -3])('parent_id %p → 422', async (parent_id) => {
    expect(await status(CategoriaDto, { name: 'x', parent_id })).toBe(422);
  });
});

describe('S4 — caractere NUL (o Postgres recusa → 500) vira 422', () => {
  it.each([['name'], ['agency'], ['account']])('conta bancária: %s com \\u0000 → 422', async (campo) => {
    expect(await status(ContaBancariaDto, { ...conta, [campo]: 'a\u0000b' })).toBe(422);
  });
  it('categoria: name com \\u0000 → 422', async () => {
    expect(await status(CategoriaDto, { name: 'a\u0000b' })).toBe(422);
  });
});

describe('S5 — campos ignorados da tela não aceitam estrutura arbitrária', () => {
  const aninhado = (niveis: number) => {
    let o: unknown = {};
    for (let i = 0; i < niveis; i++) o = { data: o };
    return o;
  };
  it('bank aninhado 20.000 níveis → 422 ou 200, nunca 500', async () => {
    expect([200, 422]).toContain(await status(ContaBancariaDto, { ...conta, bank: aninhado(20_000) }));
  });
  // A causa NÃO era o DTO: é o stripProtoKeys do ValidationPipe do Nest (recursivo), que roda antes de qualquer DTO —
  // valia para TODA rota com corpo, inclusive o login e as contas já migradas.
  it('qualquer DTO (ex.: CategoriaDto) com um campo desconhecido aninhado 20.000 níveis → 422, nunca 500', async () => {
    expect(await status(CategoriaDto, { name: 'x', lixo: aninhado(20_000) })).toBe(422);
  });
  it('profundidade legítima (objeto real da tela, ~5 níveis) continua passando', async () => {
    expect(await status(ContaBancariaDto, { ...conta, bank: aninhado(8) })).toBe(200);
  });
  it('o objeto REAL da tela continua aceito (bank.data com datas Carbon)', async () => {
    const carbon = { date: '2026-09-25 14:29:36.000000', timezone_type: 3, timezone: 'UTC' };
    const bank = { data: { id: 3, name: 'Santander', logo: 'http://x/storage/banks/imagens/a.png', created_at: carbon, updated_at: carbon } };
    expect(await status(ContaBancariaDto, { ...conta, id: 251, balance: 0, created_at: carbon, updated_at: carbon, bank })).toBe(200);
  });
});

describe('S8 — chaves de advisory lock em registro único', () => {
  it('não há chave repetida', () => {
    const valores = Object.values(CHAVES_ADVISORY_LOCK);
    expect(new Set(valores).size).toBe(valores.length);
  });
});
