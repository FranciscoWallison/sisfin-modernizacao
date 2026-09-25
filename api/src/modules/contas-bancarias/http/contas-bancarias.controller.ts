import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { CONFIG, RequisicaoComContexto } from '../../../shared/auth-compat/contexto';
import type { Config } from '../../../shared/config/config';
import { IdDaRotaPipe } from '../../../shared/http/id-da-rota.pipe';
import { banco, contaBancaria } from '../../../shared/http/serializacao';
import { ComCliente } from '../../../shared/tenant/com-cliente';
import { ContasBancariasService } from '../application/contas-bancarias.service';
import { ContaBancariaDto } from './conta-bancaria.dto';

// Escrita de /api/bank_accounts e GET /api/banks. A leitura de contas bancárias continua no compat/ (mesma
// serialização, shared/http/serializacao). Contrato: .specs/legado/modulos/contas-bancarias/contrato.md.

const dados = (dto: ContaBancariaDto) => ({
  name: dto.name, agency: dto.agency, account: dto.account, bankId: dto.bank_id, default: dto.default ?? false,
}); // id, balance, created_at, updated_at e bank do corpo são descartados aqui (REQ-CBA-08)
const cliente = (req: RequisicaoComContexto) => req.contexto!.clienteId!;

@Controller('api')
export class ContasBancariasController {
  constructor(
    private readonly contas: ContasBancariasService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get('banks')
  @ComCliente()
  async bancos() {
    return { data: (await this.contas.bancos()).map((b) => banco(b, this.config.urlArquivos)) };
  }

  @Post('bank_accounts')
  @ComCliente()
  async criar(@Body() dto: ContaBancariaDto, @Req() req: RequisicaoComContexto) {
    return { data: contaBancaria(await this.contas.criar(dados(dto), cliente(req))) };
  }

  @Put('bank_accounts/:id')
  @ComCliente()
  async atualizar(@Param('id', IdDaRotaPipe) id: number, @Body() dto: ContaBancariaDto, @Req() req: RequisicaoComContexto) {
    return { data: contaBancaria(await this.contas.atualizar(id, dados(dto), cliente(req))) };
  }

  @Delete('bank_accounts/:id')
  @HttpCode(204)
  @ComCliente()
  async excluir(@Param('id', IdDaRotaPipe) id: number, @Req() req: RequisicaoComContexto) {
    await this.contas.excluir(id, cliente(req));
  }
}
