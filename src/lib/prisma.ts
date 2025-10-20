
import { PrismaClient } from '@prisma/client';

const DEFAULT_DATABASE_URL = 'file:./dev.db';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') (globalForPrisma as any).prisma = prisma;
