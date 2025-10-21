const FALLBACK_DATABASE_URL = 'file:./dev.db';

function readDatabaseUrlFromEnv(): string | null {
  const value = process.env.DATABASE_URL;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function databaseUrl(): string {
  return readDatabaseUrlFromEnv() ?? FALLBACK_DATABASE_URL;
}

export function hasDatabaseUrl(): boolean {
  return readDatabaseUrlFromEnv() !== null;
}

export function assertDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error('A database URL could not be resolved.');
  }
  return url;
}
