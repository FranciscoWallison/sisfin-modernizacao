import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { SemNul } from '../../../shared/http/validadores';

// Campos de texto do POST/PUT /api/admin/banks (multipart ou JSON). O arquivo `logo` vem à parte (FileInterceptor).
// Mensagens do Laravel. Campos não declarados → 422 (whitelist global).
export class BancoDto {
  @SemNul('name')
  @IsString({ message: 'The name must be a string.' })
  @MaxLength(255, { message: 'The name may not be greater than 255 characters.' })
  // O autocomplete do app antigo (Vue 1, em /app, sem CSP) interpola o nome do banco em HTML SEM escapar — texto e
  // atributo data-text="…". O nome aparece para TODOS os clientes: sem estes caracteres não há como sair do texto nem
  // do atributo (revisão de segurança A06, S1). legacy/ não é editado; a barreira fica na única porta de escrita.
  @Matches(/^[^<>"']*$/, { message: 'The name may not contain the characters < > " \'.' })
  @IsNotEmpty({ message: 'The name field is required.' })
  name!: string;
}
