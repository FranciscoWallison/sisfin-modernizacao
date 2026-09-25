import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { paraNumero } from '../../../shared/http/conversoes';
import { IdDeReferencia, IgnoradoDaTela, SemNul } from '../../../shared/http/validadores';

// Corpo de POST/PUT de categorias (design §4). A tela manda { id, name, parent_id } (RN-CAT-010); sem parent_id a
// categoria é raiz (RN-CAT-007). Mensagens do Laravel (CategoryRequest). Outros campos → 422 (whitelist global).

export class CategoriaDto {
  /** A tela envia (0 ao criar, o id ao editar). Aceito e DESCARTADO: vale o id da rota (REQ-CAT-07). */
  @IgnoradoDaTela()
  id?: unknown;

  @SemNul('name')
  @IsString({ message: 'The name must be a string.' })
  @MaxLength(255, { message: 'The name may not be greater than 255 characters.' })
  @IsNotEmpty({ message: 'The name field is required.' })
  @Transform(({ value }) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value))
  name!: string;

  /**
   * Ausente, null ou '' → raiz. Senão, id de categoria do cliente NA MESMA árvore (conferido no serviço). A tela
   * envia texto ("167" — select do Materialize). Fora de 1..int4 → a mesma mensagem (S3).
   */
  @IsOptional()
  @IdDeReferencia('The selected parent id is invalid.')
  @IsInt({ message: 'The selected parent id is invalid.' })
  @Transform((p) => (p.value === '' ? null : paraNumero(p)))
  parent_id?: number | null;
}
