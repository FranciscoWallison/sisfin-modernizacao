import {
  Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UploadedFile, UseFilters, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CONFIG } from '../../../shared/auth-compat/contexto';
import type { Config } from '../../../shared/config/config';
import { IdDaRotaPipe } from '../../../shared/http/id-da-rota.pipe';
import { metaPaginacao, paginaDaQuery } from '../../../shared/http/paginacao';
import { banco } from '../../../shared/http/serializacao';
import { AdminBancosService, POR_PAGINA_ADMIN } from '../application/admin-bancos.service';
import { TAMANHO_MAXIMO_LOGO } from '../domain/imagem';
import { BancoDto } from './banco.dto';
import { ErrosDoUploadFilter } from './erros-do-upload.filter';
import { SomenteAdmin } from './somente-admin.guard';

// /api/admin/banks (ADR-010, REQ-ADB-01..05). Bancos no formato do GET /api/banks (logo absoluto). Upload em memória,
// com limites apertados: um arquivo (`logo`, até 1 MB) e poucos campos curtos — o conteúdo é validado no serviço.

const urlBase = (req: Request) => `${req.protocol}://${req.get('host')}${req.path}`;
const UPLOAD = FileInterceptor('logo', {
  limits: { fileSize: TAMANHO_MAXIMO_LOGO, files: 1, fields: 4, parts: 5, fieldSize: 4096, fieldNameSize: 100 },
});

interface ArquivoEnviado {
  buffer: Buffer;
}

@Controller('api/admin/banks')
@SomenteAdmin()
export class AdminBancosController {
  constructor(
    private readonly bancos: AdminBancosService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get()
  async listar(@Query('page') page: unknown, @Req() req: Request) {
    const pagina = paginaDaQuery(page);
    const { itens, total } = await this.bancos.listar(pagina);
    return {
      data: itens.map((b) => banco(b, this.config.urlArquivos)),
      meta: metaPaginacao(total, itens.length, pagina, urlBase(req), req.query, POR_PAGINA_ADMIN),
    };
  }

  /** Um banco, para o formulário de edição (mudança posterior do design, A05). */
  @Get(':id')
  async um(@Param('id', IdDaRotaPipe) id: number) {
    return { data: banco(await this.bancos.um(id), this.config.urlArquivos) };
  }

  @Post()
  @UseInterceptors(UPLOAD)
  @UseFilters(ErrosDoUploadFilter)
  async criar(@Body() dto: BancoDto, @UploadedFile() logo?: ArquivoEnviado) {
    return { data: banco(await this.bancos.criar(dto.name, logo?.buffer), this.config.urlArquivos) };
  }

  @Put(':id')
  @UseInterceptors(UPLOAD)
  @UseFilters(ErrosDoUploadFilter)
  async atualizar(@Param('id', IdDaRotaPipe) id: number, @Body() dto: BancoDto, @UploadedFile() logo?: ArquivoEnviado) {
    return { data: banco(await this.bancos.atualizar(id, dto.name, logo?.buffer), this.config.urlArquivos) };
  }

  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', IdDaRotaPipe) id: number) {
    await this.bancos.excluir(id);
  }
}
