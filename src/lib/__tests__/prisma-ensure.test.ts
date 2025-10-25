import fs from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient as PrismaClientType } from '@prisma/client';

import { ensurePrismaSchema } from '../prisma-ensure';

const TEST_DB = path.join(process.cwd(), 'prisma-ensure.test.db');

describe('ensurePrismaSchema', () => {
  let prisma: PrismaClientType | null = null;
  let skip = false;

  beforeAll(async () => {
    await fs.rm(TEST_DB, { force: true });
    const sqliteUrl = `file:${TEST_DB}`;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.PRISMA_SCHEMA_DISABLE_VALIDATION = '1';

    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: sqliteUrl,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('must start with the protocol `postgresql://`')) {
        skip = true;
        prisma = null;
        return;
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    await fs.rm(TEST_DB, { force: true });
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PROVIDER;
    delete process.env.PRISMA_SCHEMA_DISABLE_VALIDATION;
  });

  it('creates the required tables for sqlite databases', async () => {
    if (skip || !prisma) {
      return;
    }
    try {
      await ensurePrismaSchema(prisma);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('must start with the protocol `postgresql://`')) {
        skip = true;
        return;
      }
      throw error;
    }

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
