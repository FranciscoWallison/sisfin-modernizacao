import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';

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

/**
 * whitelist + forbidNonWhitelisted: `id`, `client_id` ou qualquer campo não declarado no DTO → 422
 * (mass assignment — revisão de segurança #7).
 */
export function criarValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true, // uma mensagem por campo, como o "bail" do Laravel
    transform: true,
    exceptionFactory: (erros) => new UnprocessableEntityException(errosNoFormatoLaravel(erros)),
  });
}
