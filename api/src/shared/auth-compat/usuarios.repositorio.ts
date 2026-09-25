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

  porEmail(email: string): Promise<UsuarioAuth | null> {
    return this.prisma.user.findUnique({ where: { email }, include: { client: true } });
  }

  porId(id: number): Promise<UsuarioAuth | null> {
    return this.prisma.user.findUnique({ where: { id }, include: { client: true } });
  }
}
