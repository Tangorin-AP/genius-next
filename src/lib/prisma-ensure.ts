import { PrismaClient } from '@prisma/client';

type SupportedProvider = 'sqlite' | 'postgresql';

function normalize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.toLowerCase();
}

function detectProvider(): SupportedProvider {
  const explicit = normalize(process.env.DATABASE_PROVIDER);
  if (explicit === 'sqlite' || explicit === 'postgresql') {
    return explicit;
  }

  const url = normalize(process.env.DATABASE_URL);
  if (url?.startsWith('postgres://') || url?.startsWith('postgresql://')) {
    return 'postgresql';
  }

  if (url?.startsWith('file:')) {
    return 'sqlite';
  }

  // Fall back to the provider used for local development.
  return 'sqlite';
}

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const provider = detectProvider();

  if (provider === 'sqlite') {
    const result = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ${tableName}
    `;
    return result.length > 0;
  }

  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;

  return Boolean(result[0]?.exists);
}

const SQLITE_SCHEMA_STATEMENTS: readonly string[] = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "email" TEXT UNIQUE,
    "emailVerified" DATETIME,
    "image" TEXT,
    "passwordHash" TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS "Deck" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Pair" (
    "id" TEXT PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "group" TEXT,
    "type" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Association" (
    "id" TEXT PRIMARY KEY,
    "pairId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "score" INTEGER,
    "dueAt" DATETIME,
    "firstTime" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("pairId") REFERENCES "Pair" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "StudySession" (
    "id" TEXT PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "StudyEvent" (
    "id" TEXT PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "associationId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sessionId") REFERENCES "StudySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "oauth_token_secret" TEXT,
    "oauth_token" TEXT,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    PRIMARY KEY ("identifier", "token")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token")`,
  `CREATE INDEX IF NOT EXISTS "Association_pairId_direction_idx" ON "Association"("pairId", "direction")`,
  `CREATE INDEX IF NOT EXISTS "Association_dueAt_idx" ON "Association"("dueAt")`
];

async function applySqliteSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of SQLITE_SCHEMA_STATEMENTS) {
    await prisma.$executeRawUnsafe(statement);
  }
}

let ensurePromise: Promise<void> | null = null;

async function ensure(prisma: PrismaClient): Promise<void> {
  const provider = detectProvider();

  if (provider === 'sqlite') {
    const hasUserTable = await tableExists(prisma, 'User');
    if (!hasUserTable) {
      await applySqliteSchema(prisma);
    }
    return;
  }

  const hasUserTable = await tableExists(prisma, 'User');
  if (!hasUserTable) {
    console.warn(
      '⚠️  Database schema appears to be missing. Run `npx prisma migrate deploy --schema=./prisma/schema.prisma` to apply migrations.',
    );
  }
}

export function ensurePrismaSchema(prisma: PrismaClient): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = ensure(prisma).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
