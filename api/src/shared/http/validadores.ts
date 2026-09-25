import { Transform } from 'class-transformer';
import { Allow, Matches, Max, Min } from 'class-validator';
import { applyDecorators } from '@nestjs/common';

// Validadores compartilhados pelos DTOs (revisão de segurança dos cadastros — S3, S4, S5).

export const INT4_MAX = 2_147_483_647;

/** Id de referência (bank_id, parent_id…): inteiro de 1 a int4 — fora disso o Postgres dava 500 (S3). */
export const IdDeReferencia = (mensagem: string) =>
  applyDecorators(Min(1, { message: mensagem }), Max(INT4_MAX, { message: mensagem }));

/** Texto sem caractere NUL: o Postgres recusa `\u0000` em text/varchar (22021 → 500) — S4. */
export const SemNul = (campo: string) =>
  Matches(/^[^\u0000]*$/, { message: `The ${campo} contains an invalid character.` });

/**
 * Campo que a TELA envia e o sistema ignora (id, balance, datas, bank…): aceito pela whitelist e DESCARTADO já na
 * transformação — o class-transformer não chega a percorrer a estrutura (objeto aninhado 20k níveis dava
 * RangeError → 500 — S5). Nenhum valor desses chega ao serviço.
 */
export const IgnoradoDaTela = () => applyDecorators(Allow(), Transform(() => undefined, { toClassOnly: true }));
