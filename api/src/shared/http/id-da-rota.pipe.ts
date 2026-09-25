import { ArgumentMetadata, Injectable, NotFoundException, ParseIntPipe } from '@nestjs/common';

const INT4_MAX = 2_147_483_647;

/**
 * `:id` da rota: como o ParseIntPipe (texto não numérico → 400), mas id fora da faixa do int4 → 404 — não existe
 * linha com esse id; antes chegava ao Postgres e virava 500 (revisão de segurança S3).
 */
@Injectable()
export class IdDaRotaPipe extends ParseIntPipe {
  override async transform(valor: string, meta: ArgumentMetadata): Promise<number> {
    const id = await super.transform(valor, meta);
    if (id < 1 || id > INT4_MAX) throw new NotFoundException();
    return id;
  }
}
