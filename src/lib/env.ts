export const FALLBACK_DATABASE_URL = 'file:./dev.db';

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

export function isUsingFallbackDatabaseUrl(): boolean {
  const value = readDatabaseUrlFromEnv();
  return value === null || value === FALLBACK_DATABASE_URL;
}

export function assertDatabaseUrl(): string {
  const url = readDatabaseUrlFromEnv();
  if (url && url !== FALLBACK_DATABASE_URL) {
    return url;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is required in production. Set the DATABASE_URL environment variable to a valid database connection string.',
    );
  }

  return FALLBACK_DATABASE_URL;
}
