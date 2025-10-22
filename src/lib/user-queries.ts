import { Prisma, type User } from '@prisma/client';

import { prisma } from './prisma';

const SELECT_FIELDS = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  passwordHash: true,
} as const;

export type BasicUser = Pick<User, keyof typeof SELECT_FIELDS>;

const SELECT_COLUMN_NAMES = Object.keys(SELECT_FIELDS) as (keyof typeof SELECT_FIELDS)[];

function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function findUserByEmailInsensitive(email: string): Promise<BasicUser | null> {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    return null;
  }

  const fallbackScan = async () => {
    const candidates = await prisma.user.findMany({
      where: { email: { not: null } },
      select: SELECT_FIELDS,
      take: 1000,
    });

    return (
      candidates.find((candidate) => candidate.email && sanitizeEmail(candidate.email) === normalized) ?? null
    );
  };

  const direct = await prisma.user.findUnique({
    where: { email: normalized },
    select: SELECT_FIELDS,
  });

  if (direct) {
    return direct;
  }

  try {
    const provider = detectDatabaseProvider();
    const insensitiveMatch = await findInsensitiveWithRaw(normalized, provider);

    if (insensitiveMatch) {
      return insensitiveMatch;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Case-insensitive email lookup failed, falling back to manual scan.', error);
    }
    return fallbackScan();
  }

  if (email !== normalized) {
    return fallbackScan();
  }

  return null;
}

type DatabaseProvider = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | undefined;

function detectDatabaseProvider(): DatabaseProvider {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return undefined;
  }

  if (url.startsWith('file:') || url.startsWith('sqlite:')) {
    return 'sqlite';
  }

  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    if (protocol.startsWith('postgres')) {
      return 'postgresql';
    }
    if (protocol.startsWith('mysql')) {
      return 'mysql';
    }
    if (protocol.startsWith('sqlserver')) {
      return 'sqlserver';
    }
  } catch {
    if (url.startsWith('postgres')) {
      return 'postgresql';
    }
    if (url.startsWith('mysql')) {
      return 'mysql';
    }
    if (url.startsWith('sqlserver')) {
      return 'sqlserver';
    }
  }

  return undefined;
}

function quoteIdentifier(identifier: string, provider: DatabaseProvider): string {
  switch (provider) {
    case 'mysql':
      return `\`${identifier}\``;
    case 'sqlserver':
      return `[${identifier}]`;
    default:
      return `"${identifier}"`;
  }
}

async function findInsensitiveWithRaw(normalized: string, provider: DatabaseProvider): Promise<BasicUser | null> {
  const quotedColumns = SELECT_COLUMN_NAMES.map((name) => quoteIdentifier(name, provider)).join(', ');
  const quotedTable = quoteIdentifier('User', provider);
  const quotedEmailColumn = quoteIdentifier('email', provider);

  let query: Prisma.Sql;

  if (provider === 'sqlserver') {
    query = Prisma.sql`
      SELECT TOP (1) ${Prisma.raw(quotedColumns)}
      FROM ${Prisma.raw(quotedTable)}
      WHERE LOWER(${Prisma.raw(quotedEmailColumn)}) = LOWER(${normalized})
    `;
  } else {
    query = Prisma.sql`
      SELECT ${Prisma.raw(quotedColumns)}
      FROM ${Prisma.raw(quotedTable)}
      WHERE LOWER(${Prisma.raw(quotedEmailColumn)}) = LOWER(${normalized})
      LIMIT 1
    `;
  }

  const results = await prisma.$queryRaw<BasicUser[]>(query);
  return results[0] ?? null;
}
