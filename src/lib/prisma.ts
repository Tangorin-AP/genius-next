
import { PrismaClient } from '@prisma/client';

import { ensurePrismaSchema } from './prisma-ensure';

const DEFAULT_DATABASE_URL = 'file:./dev.db';

type PrismaGlobal = {
  prisma?: PrismaClient;
  prismaReady?: Promise<void>;
};

const globalForPrisma = global as unknown as PrismaGlobal;

let prismaClient: PrismaClient | undefined = globalForPrisma.prisma;
let prismaReadyPromise: Promise<void> | undefined = globalForPrisma.prismaReady;

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATABASE_URL is required in production. Set the DATABASE_URL environment variable to a valid database connection string.',
      );
    }

    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
}

function createPrismaClient(): PrismaClient {
  ensureDatabaseUrl();

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = createPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      (globalForPrisma as any).prisma = prismaClient;
    }
  }

  return prismaClient;
}

function getPrismaReadyPromise(): Promise<void> {
  if (!prismaReadyPromise) {
    const client = getPrismaClient();
    prismaReadyPromise = ensurePrismaSchema(client).catch((error) => {
      prismaReadyPromise = undefined;
      throw error;
    });

    if (process.env.NODE_ENV !== 'production') {
      (globalForPrisma as any).prismaReady = prismaReadyPromise;
    }
  }

  return prismaReadyPromise;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export function prismaReady(): Promise<void> {
  return getPrismaReadyPromise();
}
