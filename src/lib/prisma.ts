
import { PrismaClient } from '@prisma/client';

import { ensurePrismaSchema } from './prisma-ensure';

const DEFAULT_DATABASE_URL = 'file:./dev.db';

if (
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') &&
  process.env.NODE_ENV !== 'production'
) {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
}

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaReady?: Promise<void>;
};

const globalForPrisma = global as unknown as PrismaGlobal;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

const prismaReadyPromise =
  globalForPrisma.prismaReady || ensurePrismaSchema(prisma);

if (process.env.NODE_ENV !== 'production') {
  (globalForPrisma as any).prisma = prisma;
  (globalForPrisma as any).prismaReady = prismaReadyPromise;
}

export const prismaReady = prismaReadyPromise;
