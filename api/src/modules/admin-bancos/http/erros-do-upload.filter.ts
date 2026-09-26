import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import type { Response } from 'express';
import { MENSAGEM_LOGO_INVALIDO } from '../domain/imagem';

/**
 * Erros do multer nas rotas com upload:
 * - arquivo acima de 1 MB (413) → o MESMO 422 do tipo inválido (design §1);
 * - demais (campo de arquivo inesperado, campos demais, multipart malformado — 400) → mensagem FIXA: a do multer
 *   repete o nome do campo enviado (revisão de segurança A06, S4).
 */
@Catch(PayloadTooLargeException, BadRequestException)
export class ErrosDoUploadFilter implements ExceptionFilter {
  catch(erro: PayloadTooLargeException | BadRequestException, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();
    if (erro instanceof PayloadTooLargeException) resposta.status(422).json({ logo: [MENSAGEM_LOGO_INVALIDO] });
    else resposta.status(400).json({ message: 'Bad Request' });
  }
}
