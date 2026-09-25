// B03 — corpo de POST/PUT de contas bancárias e de categorias pelo ValidationPipe REAL (whitelist global).
// O que importa: a tela manda campos extras (RN-CBA-009 / RN-CAT-010) que precisam passar, e só eles.
import { UnprocessableEntityException } from '@nestjs/common';
import { CategoriaDto } from '../src/modules/categorias/http/categoria.dto';
import { ContaBancariaDto } from '../src/modules/contas-bancarias/http/conta-bancaria.dto';
import { criarValidationPipe } from '../src/shared/http/validacao';

const pipe = criarValidationPipe();
const validar = <T>(tipo: new () => T, corpo: unknown): Promise<T> => pipe.transform(corpo, { type: 'body', metatype: tipo }) as Promise<T>;
const erros = async (tipo: new () => unknown, corpo: unknown) => {
  try {
    await validar(tipo, corpo);
  } catch (e) {
    return (e as UnprocessableEntityException).getResponse();
  }
  throw new Error('esperava 422');
};

const conta = { name: 'Conta', agency: '1234-5', account: '99-1', bank_id: 1 };

describe('ContaBancariaDto (REQ-CBA-01, 03, 08)', () => {
  it('corpo mínimo da tela de criação → ok, default ausente', async () => {
    const dto = await validar(ContaBancariaDto, { ...conta, default: false });
    expect(dto).toMatchObject({ ...conta, default: false });
  });

  it('objeto INTEIRO do GET ?include=bank (tela de edição) → aceito', async () => {
    const doGet = {
      id: 67, ...conta, balance: 1234.5, default: true,
      created_at: { date: '2026-09-25 13:18:31.000000', timezone_type: 3, timezone: 'UTC' },
      updated_at: { date: '2026-09-25 13:18:31.000000', timezone_type: 3, timezone: 'UTC' },
      bank: { data: { id: 1, name: 'Novo Banco', logo: 'http://x/storage/banks/imagens/a.jpeg' } },
    };
    await expect(validar(ContaBancariaDto, doGet)).resolves.toBeDefined();
  });

  it('campo que a tela NÃO manda continua 422 (mass assignment)', async () => {
    expect(await erros(ContaBancariaDto, { ...conta, client_id: 4 })).toEqual({ client_id: ['property client_id should not exist'] });
  });

  it('sem campos → as quatro mensagens required do Laravel', async () => {
    expect(await erros(ContaBancariaDto, {})).toEqual({
      name: ['The name field is required.'],
      agency: ['The agency field is required.'],
      account: ['The account field is required.'],
      bank_id: ['The bank id field is required.'],
    });
  });

  it("bank_id '' (tela sem banco escolhido) → required; 'abc' → invalid; '2' → 2", async () => {
    expect(await erros(ContaBancariaDto, { ...conta, bank_id: '' })).toEqual({ bank_id: ['The bank id field is required.'] });
    expect(await erros(ContaBancariaDto, { ...conta, bank_id: 'abc' })).toEqual({ bank_id: ['The selected bank id is invalid.'] });
    expect((await validar(ContaBancariaDto, { ...conta, bank_id: '2' })).bank_id).toBe(2);
  });

  it.each([[true, true], [false, false], [1, true], [0, false], ['1', true], ['0', false]])('default %p → %p (boolean do Laravel)', async (entrada, saida) => {
    expect((await validar(ContaBancariaDto, { ...conta, default: entrada })).default).toBe(saida);
  });

  it("default 'sim' → 422", async () => {
    expect(await erros(ContaBancariaDto, { ...conta, default: 'sim' })).toEqual({ default: ['The default field must be true or false.'] });
  });

  it('nome com 256 caracteres → max', async () => {
    expect(await erros(ContaBancariaDto, { ...conta, name: 'x'.repeat(256) })).toEqual({ name: ['The name may not be greater than 255 characters.'] });
  });
});

describe('CategoriaDto (REQ-CAT-02, 07)', () => {
  it('corpo da tela: { id: 0, name, parent_id } → ok (id aceito)', async () => {
    expect(await validar(CategoriaDto, { id: 0, name: 'X', parent_id: 5 })).toMatchObject({ name: 'X', parent_id: 5 });
  });

  it("parent_id ausente, null ou '' → raiz", async () => {
    for (const corpo of [{ name: 'X' }, { name: 'X', parent_id: null }, { name: 'X', parent_id: '' }]) {
      expect((await validar(CategoriaDto, corpo)).parent_id ?? null).toBeNull();
    }
  });

  it("parent_id '7' → 7; 'abc' → invalid", async () => {
    expect((await validar(CategoriaDto, { name: 'X', parent_id: '7' })).parent_id).toBe(7);
    expect(await erros(CategoriaDto, { name: 'X', parent_id: 'abc' })).toEqual({ parent_id: ['The selected parent id is invalid.'] });
  });

  it('sem nome → required; campo desconhecido → 422', async () => {
    expect(await erros(CategoriaDto, {})).toEqual({ name: ['The name field is required.'] });
    expect(await erros(CategoriaDto, { name: 'X', client_id: 4 })).toEqual({ client_id: ['property client_id should not exist'] });
  });
});
