
import { PrismaClient } from '@prisma/client';

const resolveDatabaseUrl = () => {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];

  for (const url of candidates) {
    if (url) {
      return url;
    }
  }

  return undefined;
};

export const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  throw new Error(
    'Missing database connection string. Set DATABASE_URL or POSTGRES_PRISMA_URL in your environment.'
  );
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
