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
  const trimmed = (value: string | undefined | null): string | null => {
    if (typeof value !== 'string') return null;
    const result = value.trim();
    return result === '' ? null : result;
  };

  const normalizeDeploymentIdentifier = (
    value: string | undefined | null,
  ): string | null => {
    const candidate = trimmed(value);
    if (!candidate) return null;

    const valueToParse = candidate.includes('://') ? candidate : `https://${candidate}`;
    try {
      const url = new URL(valueToParse);
      const host = url.hostname.toLowerCase();
      const port = url.port ? `:${url.port}` : '';

      let pathname = url.pathname;
      while (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      if (pathname === '/') {
        pathname = '';
      }

      let normalized = `${host}${port}`;
      if (pathname) normalized += pathname;
      if (url.search) normalized += url.search;
      if (url.hash) normalized += url.hash;

      return normalized;
    } catch (_error) {
      // If parsing fails, fall back to the trimmed value so we still have a stable identifier.
      return candidate;
    }
  };

  const projectIdentifier =
    trimmed(process.env.AUTH_SECRET_SEED) ??
    trimmed(process.env.VERCEL_PROJECT_ID) ??
    normalizeDeploymentIdentifier(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    normalizeDeploymentIdentifier(process.env.NEXTAUTH_URL) ??
    normalizeDeploymentIdentifier(process.env.VERCEL_URL) ??
    'genius-next';

  const environmentIdentifier =
    trimmed(process.env.VERCEL_ENV) ??
    trimmed(process.env.NODE_ENV) ??
    'production';

  const base = `${projectIdentifier}|${environmentIdentifier}|${new Date('2024-01-01').toISOString()}`;

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
