// Conversores de corpo para os DTOs (class-transformer @Transform). O SPA envia ids, booleanos e valores às vezes como
// texto (campos de formulário) — convertemos o que é inequívoco e deixamos o resto para a validação recusar.

/** "12" → 12. Texto vazio ou não numérico fica como veio (a validação decide). */
export const paraNumero = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value;

/** Os mesmos valores que a regra `boolean` do Laravel aceita: true/false, 1/0, "1"/"0" (e "true"/"false"). */
export const paraBooleano = ({ value }: { value: unknown }) =>
  value === 1 || value === '1' || value === 'true' ? true : value === 0 || value === '0' || value === 'false' ? false : value;

/** `''` e só espaços contam como AUSENTES (como o `required` do Laravel) → undefined. */
export const vazioComoAusente = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
