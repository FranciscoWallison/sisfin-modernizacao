// FIXTURE de teste (T02): violação proposital — domain/ importando o Prisma. Não é código da aplicação.
import { PrismaClient } from '@prisma/client';

export const cliente = (): PrismaClient => new PrismaClient();
