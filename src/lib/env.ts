export const FALLBACK_DATABASE_URL = 'file:./dev.db';

type AuthSecretLoadResult = { secret: string; fromEnv: boolean };

let warnedGeneratedAuthSecret = false;

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

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function mix(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash = rotateLeft(hash, 13);
  }
  return hash >>> 0;
}

function deriveFallbackAuthSecret(): string {
  const seeds = [
    process.env.AUTH_SECRET_SEED,
    process.env.DATABASE_URL,
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_ENV,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.NEXTAUTH_URL,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  const base =
    seeds.length > 0
      ? seeds.join('|')
      : `genius-next|${process.env.NODE_ENV ?? 'production'}|${new Date('2024-01-01').toISOString()}`;

  const parts: string[] = [];
  let hashA = mix(base, 0x811c9dc5);
  let hashB = mix(base.split('').reverse().join(''), 0x9e3779b1);

  for (let i = 0; i < 8; i += 1) {
    hashA = mix(base.slice(i), hashA ^ (0x01000193 + i * 17));
    hashB = mix(base.slice(0, base.length - i), hashB ^ (0x85ebca6b + i * 131));
    const combined = (hashA + rotateLeft(hashB, i + 7) + i * 0x27d4eb2d) >>> 0;
    parts.push(combined.toString(16).padStart(8, '0'));
  }

  return parts.join('').slice(0, 64);
}

function loadAuthSecret(): AuthSecretLoadResult {
  const fromEnv = readAuthSecretFromEnv();
  const result: AuthSecretLoadResult = fromEnv
    ? { secret: fromEnv, fromEnv: true }
    : { secret: deriveFallbackAuthSecret(), fromEnv: false };

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = result.secret;
  }
  if (!process.env.NEXTAUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = result.secret;
  }

  return result;
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

type ResolveAuthSecretOptions = { allowGeneratedInProduction?: boolean };

export function resolveAuthSecret(options?: ResolveAuthSecretOptions): AuthSecretLoadResult {
  const result = loadAuthSecret();

  if (!result.fromEnv) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      if (options?.allowGeneratedInProduction) {
        if (!warnedGeneratedAuthSecret) {
          console.error(
            'AUTH_SECRET or NEXTAUTH_SECRET environment variable is not set. Using a derived fallback secret. Configure AUTH_SECRET or NEXTAUTH_SECRET to ensure consistent authentication in production.',
          );
          warnedGeneratedAuthSecret = true;
        }
      } else {
        throw new Error(
          'AUTH_SECRET or NEXTAUTH_SECRET is required in production. Set one of these environment variables to a secure random value.',
        );
      }
    } else if (options?.allowGeneratedInProduction && !warnedGeneratedAuthSecret) {
      console.warn(
        'Authentication secret environment variables are not configured. Using a derived fallback secret for development.',
      );
      warnedGeneratedAuthSecret = true;
    }
  }

  return result;
}

export function ensureAuthSecret(): string {
  return resolveAuthSecret().secret;
}

export function ensureAuthSecretForRuntime(): AuthSecretLoadResult {
  return resolveAuthSecret({ allowGeneratedInProduction: true });
}

export function hasAuthSecret(): boolean {
  return loadAuthSecret().fromEnv;
}
