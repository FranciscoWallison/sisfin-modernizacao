import { ArgumentMetadata, UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';

/** Erros de validação no formato do Laravel: 422 `{ "campo": ["mensagem"] }` (contrato.md). */
export function errosNoFormatoLaravel(erros: ValidationError[], prefixo = ''): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const e of erros) {
    const campo = prefixo ? `${prefixo}.${e.property}` : e.property;
    if (e.constraints) saida[campo] = Object.values(e.constraints);
    if (e.children?.length) Object.assign(saida, errosNoFormatoLaravel(e.children, campo));
  }
  return saida;
}

/** Nenhum corpo legítimo passa de ~6 níveis (o maior é o objeto da tela de edição de conta bancária). */
export const PROFUNDIDADE_MAXIMA_DO_CORPO = 32;

/** Profundidade de objetos/arrays aninhados, SEM recursão; para assim que passar do limite. */
export function excedeProfundidade(valor: unknown, limite = PROFUNDIDADE_MAXIMA_DO_CORPO): boolean {
  const pilha: { v: unknown; nivel: number }[] = [{ v: valor, nivel: 0 }];
  while (pilha.length) {
    const { v, nivel } = pilha.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (nivel >= limite) return true;
    for (const filho of Object.values(v)) pilha.push({ v: filho, nivel: nivel + 1 });
  }
  return false;
}

/**
 * O ValidationPipe do Nest percorre o corpo RECURSIVAMENTE (stripProtoKeys, antes de qualquer DTO): um JSON aninhado
 * a 20 mil níveis estourava a pilha → 500 em TODA rota com corpo (revisão de segurança dos cadastros, S5).
 * A profundidade é conferida antes, de forma iterativa → 422.
 */
class PipeDeValidacao extends ValidationPipe {
  override async transform(valor: unknown, meta: ArgumentMetadata): Promise<unknown> {
    if (excedeProfundidade(valor)) throw new UnprocessableEntityException({ message: 'The given data was invalid.' });
    return super.transform(valor, meta);
  }
}

/**
 * whitelist + forbidNonWhitelisted: `id`, `client_id` ou qualquer campo não declarado no DTO → 422
 * (mass assignment — revisão de segurança #7).
 */
export function criarValidationPipe(): ValidationPipe {
  return new PipeDeValidacao({
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true, // uma mensagem por campo, como o "bail" do Laravel
    transform: true,
    exceptionFactory: (erros) => new UnprocessableEntityException(errosNoFormatoLaravel(erros)),
  });
}
