import { Transform } from 'class-transformer';
import { IsBoolean, IsDefined, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { paraBooleano, paraNumero, vazioComoAusente } from '../../../shared/http/conversoes';
import { IdDeReferencia, IgnoradoDaTela, SemNul } from '../../../shared/http/validadores';

// Corpo de POST/PUT de contas bancárias (design §3). Regras do BankAccountCreateRequest (o Update herda as mesmas —
// RN-CBA-008: PUT exige tudo). Mensagens do Laravel. Campos não declarados → 422 (whitelist global).

export class ContaBancariaDto {
  // A tela de edição reenvia o objeto inteiro do GET ?include=bank (RN-CBA-009). Aceitos e DESCARTADOS (REQ-CBA-08):
  // o id vem da rota e o saldo só muda por lançamento (REQ-CBA-03).
  @IgnoradoDaTela() id?: unknown;
  @IgnoradoDaTela() balance?: unknown;
  @IgnoradoDaTela() created_at?: unknown;
  @IgnoradoDaTela() updated_at?: unknown;
  @IgnoradoDaTela() bank?: unknown;

  @SemNul('name')
  @IsString({ message: 'The name must be a string.' })
  @MaxLength(255, { message: 'The name may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The name field is required.' })
  name!: string;

  @SemNul('agency')
  @IsString({ message: 'The agency must be a string.' })
  @MaxLength(255, { message: 'The agency may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The agency field is required.' })
  agency!: string;

  @SemNul('account')
  @IsString({ message: 'The account must be a string.' })
  @MaxLength(255, { message: 'The account may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The account field is required.' })
  account!: string;

  // '' (tela sem banco escolhido) conta como ausente → "required" (RN-CBA-009); existência conferida no serviço;
  // fora de 1..int4 → invalid (S3: antes chegava ao Postgres e dava 500)
  @IdDeReferencia('The selected bank id is invalid.')
  @IsInt({ message: 'The selected bank id is invalid.' })
  @IsDefined({ message: 'The bank id field is required.' })
  @Transform((p) => paraNumero({ value: vazioComoAusente(p) }))
  bank_id!: number;

  @IsOptional()
  @IsBoolean({ message: 'The default field must be true or false.' })
  @Transform(paraBooleano)
  default?: boolean;
}
