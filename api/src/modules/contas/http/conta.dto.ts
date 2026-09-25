import { Transform } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateBy, ValidateIf,
} from 'class-validator';
import { paraBooleano, paraNumero } from '../../../shared/http/conversoes';

// Corpo de POST/PUT de contas (design §6, REQ-CON-01/02/13). O SPA envia ids e valor às vezes como texto
// (campos de formulário) — convertemos, mas sem aceitar lixo. Campos não declarados → 422 (whitelist global).

/**
 * Valor monetário (REQ-CON-02 / REQ-CON-13): texto decimal com até 2 casas, > 0 e ≤ 999.999.999,99.
 * Recebe número ou texto e é validado DEPOIS de virar texto — os centavos não passam por ponto flutuante.
 * (A 1ª versão usava @Min/@Max, que comparam NÚMERO — com o valor já em texto, toda conta dava 422.)
 */
const ValorMonetario = () =>
  ValidateBy({
    name: 'valorMonetario',
    validator: {
      validate: (v: unknown) => typeof v === 'string' && /^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) > 0,
      defaultMessage: () => 'The value must be a number greater than 0 with at most 2 decimal places (max 999999999.99).',
    },
  });

/** "aaaa-mm-dd" que EXISTE no calendário (2026-02-31 e 2026-13-45 viravam Invalid Date e 500 — revisão do código). */
const DataReal = () =>
  ValidateBy({
    name: 'dataReal',
    validator: {
      validate: (v: unknown) =>
        typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
      defaultMessage: () => 'The date due is not a valid date.',
    },
  });

export class ContaDto {
  @IsString({ message: 'The name must be a string.' })
  @MaxLength(255, { message: 'The name may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The name field is required.' })
  name!: string;

  @DataReal()
  @IsNotEmpty({ message: 'The date due field is required.' })
  date_due!: string;

  // > 0 (corrige RN-CON-015), ≤ 999.999.999,99, no máximo 2 casas (REQ-CON-02 / REQ-CON-13)
  @ValorMonetario()
  @Transform(({ value }) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value), { toClassOnly: true })
  @IsNotEmpty({ message: 'The value field is required.' })
  value!: string;

  @IsOptional()
  @IsBoolean({ message: 'The done field must be true or false.' })
  @Transform(paraBooleano)
  done?: boolean;

  // Obrigatórios (corrige RN-CON-013: sem eles o legado dava 500)
  @IsInt({ message: 'The category id field is required.' })
  @Transform(paraNumero)
  category_id!: number;

  @IsInt({ message: 'The bank account id field is required.' })
  @Transform(paraNumero)
  bank_account_id!: number;

  @IsOptional()
  @IsBoolean({ message: 'The repeat field must be true or false.' })
  @Transform(paraBooleano)
  repeat?: boolean;

  @ValidateIf((o: ContaDto) => o.repeat === true)
  @Max(120, { message: 'The repeat number may not be greater than 120.' }) // teto contra DoS (revisão #7)
  @Min(0, { message: 'The repeat number must be at least 0.' })
  @IsInt({ message: 'The repeat number field is required when repeat is true.' })
  @Transform(paraNumero)
  repeat_number?: number;

  @ValidateIf((o: ContaDto) => o.repeat === true)
  @IsIn([1, 2], { message: 'The selected repeat type is invalid.' })
  @Transform(paraNumero)
  repeat_type?: 1 | 2;
}
