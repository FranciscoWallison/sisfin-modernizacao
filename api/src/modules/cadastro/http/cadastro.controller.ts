import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CadastroService } from '../application/cadastro.service';
import { CadastroDto } from './cadastro.dto';
import { LimiteCadastroGuard } from './limite-cadastro.guard';

// POST /api/register — PÚBLICA (ADR-009): substitui o formulário POST /register do site do legado. O limite de
// 60 req/min por IP das rotas /api (LimiteRequisicoesGuard, global) vale aqui, e mais um limite próprio por hora.

@Controller('api')
export class CadastroController {
  constructor(private readonly cadastro: CadastroService) {}

  @Post('register')
  @HttpCode(201)
  @UseGuards(LimiteCadastroGuard) // além do limite geral de /api: balde próprio por hora (S3)
  registrar(@Body() dto: CadastroDto) {
    // password_confirmation só serviu para a regra `confirmed`; o cliente vai como veio do DTO (name, email)
    return this.cadastro.cadastrar({
      name: dto.name, email: dto.email, password: dto.password, client: { name: dto.client.name, email: dto.client.email },
    });
  }
}
