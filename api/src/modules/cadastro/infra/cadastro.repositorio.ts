import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

// EXCEÇÃO À REGRA "infra usa PRISMA_TENANT" (design §1, registrada no .dependency-cruiser.cjs só para este arquivo):
// Client e User não têm tenant — são a RAIZ dele. O cadastro é público (não há cliente no contexto) e este
// repositório só CRIA um cliente novo e o primeiro usuário dele; não lê dados de nenhum cliente existente.

const agora = () => new Date(Math.floor(Date.now() / 1000) * 1000); // precisão de segundos, como o Laravel

export interface NovoCadastro {
  cliente: { name: string; email: string };
  usuario: { name: string; email: string; senhaHash: string };
}

@Injectable()
export class CadastroRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RN-SIT-009: o legado (utf8_unicode_ci) não diferencia maiúsculas no unique:users. Igualdade com lower() — e não
   * `mode: 'insensitive'`, que vira ILIKE: "a_b@x.com" colidia com "axb@x.com" e "%@empresa.com" enumerava (S1).
   */
  async emailEmUso(email: string): Promise<boolean> {
    const [r] = await this.prisma.$queryRaw<{ existe: boolean }[]>`SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(${email})) AS existe`;
    return r.existe;
  }

  /** REQ-SIT-01: cliente e usuário numa transação — se o usuário falhar, o cliente não fica órfão. */
  criar(c: NovoCadastro) {
    return this.prisma.$transaction(async (tx) => {
      const t = agora();
      const cliente = await tx.client.create({ data: { name: c.cliente.name, email: c.cliente.email, createdAt: t, updatedAt: t } });
      return tx.user.create({
        data: { name: c.usuario.name, email: c.usuario.email, password: c.usuario.senhaHash, role: 'client', clientId: cliente.id, createdAt: t, updatedAt: t },
        select: { id: true, name: true, email: true, clientId: true },
      });
    });
  }
}
