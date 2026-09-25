import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UsuarioAuth {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  clientId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  client: { id: number; name: string; email: string; code: string | null; createdAt: Date | null; updatedAt: Date | null } | null;
}

export abstract class UsuariosRepositorio {
  abstract porEmail(email: string): Promise<UsuarioAuth | null>;
  abstract porId(id: number): Promise<UsuarioAuth | null>;
}

@Injectable()
export class PrismaUsuariosRepositorio extends UsuariosRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Sem diferenciar maiúsculas, como o legado (utf8_unicode_ci — RN-SIT-009): IGUALDADE com lower() dos dois lados
   * (usa o índice único lower(email)). NÃO usar `mode: 'insensitive'`: o Prisma gera ILIKE, e "%" casava com o 1º
   * usuário — login sem conhecer e-mail nenhum (revisão de segurança do site, S1; teste vermelho antes).
   */
  async porEmail(email: string): Promise<UsuarioAuth | null> {
    const [achado] = await this.prisma.$queryRaw<{ id: number }[]>`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
    return achado ? this.porId(achado.id) : null;
  }

  porId(id: number): Promise<UsuarioAuth | null> {
    return this.prisma.user.findUnique({ where: { id }, include: { client: true } });
  }
}
