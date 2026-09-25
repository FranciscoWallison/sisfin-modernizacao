import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

/**
 * Filtro global com mapeamento FECHADO (design §10, revisão de segurança #9):
 * - HttpException → status e corpo dela;
 * - erro conhecido do Prisma (P2025 → 404; P2002/P2003 → 422) — detectado por formato, sem importar o Prisma aqui
 *   (regra de camadas: só infra/ importa @prisma/client);
 * - qualquer outro → 500 genérico com id de correlação. Tabela, coluna e SQL só vão para o log.
 */
@Catch()
export class ExcecoesFilter implements ExceptionFilter {
  private readonly log = new Logger('Excecoes');

  catch(erro: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    if (erro instanceof HttpException) {
      resposta.status(erro.getStatus()).json(this.corpoHttp(erro));
      return;
    }

    const codigoPrisma = (erro as { code?: unknown })?.code;
    if (typeof codigoPrisma === 'string' && /^P\d{4}$/.test(codigoPrisma)) {
      if (codigoPrisma === 'P2025') {
        resposta.status(404).json({ message: 'Not Found' });
        return;
      }
      if (codigoPrisma === 'P2002' || codigoPrisma === 'P2003') {
        resposta.status(422).json({ message: 'The given data was invalid.' });
        return;
      }
      // Conflito de transação / deadlock (40P01) / serialização (40001): o cliente pode repetir
      const codigoBanco = (erro as { meta?: { code?: unknown } })?.meta?.code;
      if (codigoPrisma === 'P2034' || (codigoPrisma === 'P2010' && (codigoBanco === '40P01' || codigoBanco === '40001'))) {
        resposta.status(409).json({ message: 'Conflict. Please try again.' });
        return;
      }
    }

    const id = randomUUID();
    const nome = (erro as Error)?.name ?? '';
    // Erros do Prisma trazem os ARGUMENTOS da query na mensagem (nomes, valores, datas): no log só nome e código
    // (revisão de segurança do código — PII e dado financeiro fora dos logs)
    const detalhe = nome.startsWith('PrismaClient')
      ? `${nome} ${typeof codigoPrisma === 'string' ? codigoPrisma : ''}`.trim()
      : ((erro as Error)?.stack ?? String(erro));
    this.log.error(`erro não tratado [${id}]: ${detalhe}`);
    resposta.status(500).json({ message: 'Server Error', id });
  }

  private corpoHttp(erro: HttpException): unknown {
    const corpo = erro.getResponse();
    if (typeof corpo === 'string') return { message: corpo };
    // Nest embrulha como { statusCode, message, error }; o legado responde só { message }
    const c = corpo as Record<string, unknown>;
    if ('statusCode' in c && 'message' in c && Object.keys(c).every((k) => ['statusCode', 'message', 'error'].includes(k))) {
      return { message: c.message };
    }
    return corpo;
  }
}
