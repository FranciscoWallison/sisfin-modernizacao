import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { CONFIG } from '../../../shared/auth-compat/contexto';
import { emitirToken } from '../../../shared/auth-compat/tokens';
import type { Config } from '../../../shared/config/config';
import { CadastroRepositorio } from '../infra/cadastro.repositorio';

export interface EntradaCadastro {
  name: string;
  email: string;
  password: string;
  client: { name: string; email: string };
}

const EMAIL_EM_USO = () => new UnprocessableEntityException({ email: ['The email has already been taken.'] });
/** Violação do índice único de e-mail (corrida entre dois cadastros): mesma resposta da checagem. */
const ehUnicidadeViolada = (e: unknown) => (e as { code?: unknown })?.code === 'P2002';

@Injectable()
export class CadastroService {
  constructor(
    private readonly repo: CadastroRepositorio,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** REQ-SIT-01/02: cria cliente + usuário (bcrypt, role client) e devolve o MESMO JWT do access_token. */
  async cadastrar(e: EntradaCadastro): Promise<{ token: string }> {
    if (await this.repo.emailEmUso(e.email)) throw EMAIL_EM_USO();
    const senhaHash = await bcrypt.hash(e.password, 10);
    try {
      const usuario = await this.repo.criar({ cliente: e.client, usuario: { name: e.name, email: e.email, senhaHash } });
      return { token: emitirToken(this.config.jwtSegredo, usuario, this.config.jwtEmissor) };
    } catch (erro) {
      if (ehUnicidadeViolada(erro)) throw EMAIL_EM_USO();
      throw erro;
    }
  }
}
