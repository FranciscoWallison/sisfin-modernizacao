import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, Inject, Post, Req, UseGuards } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Config } from '../config/config';
import { CONFIG, RequisicaoComContexto } from './contexto';
import { ListaNegra, TentativasLogin } from './controles';
import { JwtAuthGuard } from './jwt-auth.guard';
import { emitirToken } from './tokens';
import { UsuarioAuth, UsuariosRepositorio } from './usuarios.repositorio';

class LoginDto {
  @IsString({ message: 'The email must be a string.' })
  @IsNotEmpty({ message: 'The email field is required.' })
  email!: string;

  @IsString({ message: 'The password must be a string.' })
  @IsNotEmpty({ message: 'The password field is required.' })
  password!: string;
}

// Hash de uma senha qualquer: comparar mesmo quando o usuário não existe iguala o tempo de resposta
// (não revela quais e-mails existem).
const HASH_FICTICIO = bcrypt.hashSync('senha-ficticia-para-igualar-o-tempo', 10);

const dataTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null);

/** Autenticação compatível com o legado (design §8, RN-AUT-001..003, REQ-CON-13). */
@Controller('api')
export class AuthController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly usuarios: UsuariosRepositorio,
    private readonly tentativas: TentativasLogin,
    private readonly listaNegra: ListaNegra,
  ) {}

  @Post('access_token')
  @HttpCode(200)
  async accessToken(@Body() dto: LoginDto, @Req() req: RequisicaoComContexto): Promise<{ token: string }> {
    const ip = req.ip ?? 'desconhecido';
    const bloqueado = this.tentativas.segundosBloqueado(dto.email, ip);
    if (bloqueado > 0) {
      throw new HttpException({ message: `Too many login attempts. Please try again in ${bloqueado} seconds.` }, 403);
    }

    const usuario = await this.usuarios.porEmail(dto.email);
    const hash = (usuario?.password ?? HASH_FICTICIO).replace(/^\$2y\$/, '$2b$'); // $2y$ (PHP) = $2b$
    const senhaOk = await bcrypt.compare(dto.password, hash);

    // Usuário sem cliente não loga (RN-CON-019 → REQ-CON-13); mesma resposta de credencial errada
    if (!usuario || !senhaOk || usuario.clientId === null) {
      this.tentativas.registrarFalha(dto.email, ip);
      throw new HttpException({ message: 'These credentials do not match our records.' }, 400);
    }

    this.tentativas.limpar(dto.email, ip);
    const emissor = `${req.protocol}://${req.get('host')}/api/access_token`;
    return { token: emitirToken(this.config.jwtSegredo, usuario, emissor) };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: RequisicaoComContexto): void {
    const { jti, exp } = req.contexto!;
    this.listaNegra.adicionar(jti, exp);
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  usuario(@Req() req: RequisicaoComContexto) {
    const u: UsuarioAuth = req.contexto!.usuario;
    if (!u.client) throw new ForbiddenException({ message: 'Forbidden.' });
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      created_at: dataTexto(u.createdAt),
      updated_at: dataTexto(u.updatedAt),
      role: u.role,
      client_id: u.clientId,
      client: {
        id: u.client.id,
        name: u.client.name,
        email: u.client.email,
        code: u.client.code,
        created_at: dataTexto(u.client.createdAt),
        updated_at: dataTexto(u.client.updatedAt),
      },
    };
  }
}
