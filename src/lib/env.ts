export const FALLBACK_DATABASE_URL = 'file:./dev.db';

function readAuthSecretFromEnv(): string | null {
  const candidates = [process.env.AUTH_SECRET, process.env.NEXTAUTH_SECRET];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed !== '') {
      return trimmed;
    }
  }
  return null;
}

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

export function hasAuthSecret(): boolean {
  return readAuthSecretFromEnv() !== null;
}

export function ensureAuthSecret(): string {
  const secret = readAuthSecretFromEnv();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_SECRET or NEXTAUTH_SECRET is required in production. Set one of these environment variables to a secure random value.',
    );
  }

  return 'development-auth-secret';
}
