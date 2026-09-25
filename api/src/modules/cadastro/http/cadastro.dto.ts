import { plainToInstance, Transform } from 'class-transformer';
import { Allow, IsEmail, IsNotEmpty, IsString, MaxLength, MinLength, ValidateBy, ValidateNested } from 'class-validator';
import { SemNul } from '../../../shared/http/validadores';

// Corpo de POST /api/register (REQ-SIT-02): as regras do UserRegisterRequest do legado e as MENSAGENS que as sondas
// capturaram (tools/sondas/site-mensagens-legado.mjs). Única correção: client.email com formato (ADR-009).
// A unicidade do e-mail (sem diferenciar maiúsculas — RN-SIT-009) é conferida no serviço.

/** Laravel `confirmed`: o erro sai no campo `password`, não no de confirmação. */
const Confirmada = () =>
  ValidateBy({
    name: 'confirmada',
    validator: {
      validate: (v: unknown, args) => v === (args?.object as { password_confirmation?: unknown }).password_confirmation,
      defaultMessage: () => 'The password confirmation does not match.',
    },
  });

export class ClienteDoCadastroDto {
  @SemNul('client.name')
  @IsString({ message: 'The client.name must be a string.' })
  @MaxLength(255, { message: 'The client.name may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The client.name field is required.' })
  name!: string;

  @SemNul('client.email')
  @IsEmail({}, { message: 'The client.email must be a valid email address.' })
  @MaxLength(255, { message: 'The client.email may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The client.email field is required.' })
  email!: string;
}

export class CadastroDto {
  @SemNul('name')
  @IsString({ message: 'The name must be a string.' })
  @MaxLength(255, { message: 'The name may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The name field is required.' })
  name!: string;

  @SemNul('email')
  @IsEmail({}, { message: 'The email must be a valid email address.' })
  @MaxLength(255, { message: 'The email may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The email field is required.' })
  email!: string;

  @Confirmada()
  @MaxLength(20, { message: 'The password may not be greater than 20 characters.' })
  @MinLength(6, { message: 'The password must be at least 6 characters.' })
  @IsString({ message: 'The password must be a string.' })
  @IsNotEmpty({ message: 'The password field is required.' })
  password!: string;

  /** Só serve para a regra `confirmed` da senha; não vai para o banco. */
  @Allow()
  password_confirmation?: unknown;

  /**
   * Sem `client` (ou não-objeto), o Laravel reporta client.name e client.email como obrigatórios: o objeto vazio
   * entra na validação aninhada para produzir as mesmas duas mensagens. O valor padrão cobre o `client` AUSENTE
   * (o @Transform não é chamado para chave que não veio).
   */
  @ValidateNested()
  @Transform(({ value }) => plainToInstance(ClienteDoCadastroDto, value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}), { toClassOnly: true })
  client: ClienteDoCadastroDto = new ClienteDoCadastroDto();
}
