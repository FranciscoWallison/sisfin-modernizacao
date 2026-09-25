// S01 — corpo do cadastro pelo ValidationPipe REAL, com as mensagens que as sondas capturaram no legado
// (tools/sondas/site-mensagens-legado.mjs; contrato em .specs/legado/modulos/site/contrato.md).
import { UnprocessableEntityException } from '@nestjs/common';
import { CadastroDto } from '../src/modules/cadastro/http/cadastro.dto';
import { criarValidationPipe } from '../src/shared/http/validacao';

const pipe = criarValidationPipe();
const erros = async (corpo: unknown) => {
  try {
    await pipe.transform(corpo, { type: 'body', metatype: CadastroDto });
  } catch (e) {
    return (e as UnprocessableEntityException).getResponse();
  }
  return null;
};
const valido = { name: 'Ana', email: 'ana@x.com', password: 'segredo1', password_confirmation: 'segredo1', client: { name: 'Empresa', email: 'empresa@x.com' } };

describe('CadastroDto — mensagens do legado (REQ-SIT-02)', () => {
  it('corpo válido → sem erros', async () => {
    expect(await erros(valido)).toBeNull();
  });

  it('vazio → as cinco "required" do legado (inclusive client.name e client.email)', async () => {
    expect(await erros({})).toEqual({
      name: ['The name field is required.'],
      email: ['The email field is required.'],
      password: ['The password field is required.'],
      'client.name': ['The client.name field is required.'],
      'client.email': ['The client.email field is required.'],
    });
  });

  it.each([
    ['e-mail inválido', { email: 'nao-e-email' }, { email: ['The email must be a valid email address.'] }],
    ['senha curta (antes da confirmação, como no legado)', { password: '123', password_confirmation: '999' }, { password: ['The password must be at least 6 characters.'] }],
    ['senha com 21', { password: 'a'.repeat(21), password_confirmation: 'a'.repeat(21) }, { password: ['The password may not be greater than 20 characters.'] }],
    ['confirmação diferente', { password_confirmation: 'outra123' }, { password: ['The password confirmation does not match.'] }],
    ['client.email sem formato (legado aceitava — ADR-009)', { client: { name: 'E', email: 'nao-e-email' } }, { 'client.email': ['The client.email must be a valid email address.'] }],
    ['client não-objeto', { client: 'x' }, { 'client.name': ['The client.name field is required.'], 'client.email': ['The client.email field is required.'] }],
    ['nome com 256', { name: 'x'.repeat(256) }, { name: ['The name may not be greater than 255 characters.'] }],
  ])('%s', async (_n, alteracao, esperado) => {
    expect(await erros({ ...valido, ...alteracao })).toEqual(esperado);
  });

  it('campo desconhecido (ex.: role, client_id) → 422 — ninguém se cadastra como admin', async () => {
    expect(await erros({ ...valido, role: 'admin' })).toEqual({ role: ['property role should not exist'] });
    expect(await erros({ ...valido, client_id: 1 })).toEqual({ client_id: ['property client_id should not exist'] });
    expect(await erros({ ...valido, client: { ...valido.client, code: 'X' } })).toEqual({ 'client.code': ['property code should not exist'] });
  });
});
