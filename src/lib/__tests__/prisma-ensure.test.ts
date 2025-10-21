import fs from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@prisma/client';

import { ensurePrismaSchema } from '../prisma-ensure';

const TEST_DB = path.join(process.cwd(), 'prisma-ensure.test.db');

describe('ensurePrismaSchema', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await fs.rm(TEST_DB, { force: true });
    process.env.DATABASE_URL = `file:${TEST_DB}`;
    process.env.DATABASE_PROVIDER = 'sqlite';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${TEST_DB}`,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await fs.rm(TEST_DB, { force: true });
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PROVIDER;
  });

  it('creates the required tables for sqlite databases', async () => {
    await ensurePrismaSchema(prisma);

    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('User', 'Deck', 'Pair')
    `;

    expect(tables.map((row) => row.name).sort()).toEqual(['Deck', 'Pair', 'User']);

    const created = await prisma.user.create({
      data: { email: 'ensure@example.com', passwordHash: 'hash' },
    });

    expect(created).toMatchObject({ email: 'ensure@example.com' });
  });
});
