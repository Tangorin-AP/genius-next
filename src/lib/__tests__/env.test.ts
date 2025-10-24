import { expect, test, vi } from 'vitest';

async function deriveFallbackSecret(overrides: Record<string, string | undefined>) {
  const originalEnv = process.env;
  const envCopy: NodeJS.ProcessEnv = { ...originalEnv };

  for (const key of [
    'AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'AUTH_SECRET_SEED',
    'NEXT_PUBLIC_VERCEL_URL',
    'NEXTAUTH_URL',
    'VERCEL_URL',
    'VERCEL_PROJECT_ID',
  ]) {
    delete envCopy[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete envCopy[key];
    } else {
      envCopy[key] = value;
    }
  }

  process.env = envCopy;
  vi.resetModules();

  try {
    const { ensureAuthSecretForRuntime } = await import('../env');
    const { secret, fromEnv } = ensureAuthSecretForRuntime();
    expect(fromEnv).toBe(false);
    return secret;
  } finally {
    process.env = originalEnv;
  }
}

test('derives the same fallback secret for normalized NEXTAUTH_URL and VERCEL_URL', async () => {
  const nextAuthSecret = await deriveFallbackSecret({ NEXTAUTH_URL: 'https://example.com' });
  const vercelSecret = await deriveFallbackSecret({ VERCEL_URL: 'example.com/' });

  expect(nextAuthSecret).toBe(vercelSecret);
});

test('normalizes case, scheme, and trailing slash differences for deployment URLs', async () => {
  const httpsSecret = await deriveFallbackSecret({
    NEXT_PUBLIC_VERCEL_URL: 'HTTPS://Example.COM/app/',
  });
  const httpSecret = await deriveFallbackSecret({
    NEXT_PUBLIC_VERCEL_URL: 'http://example.com/app',
  });

  expect(httpsSecret).toBe(httpSecret);
});

test('ignores VERCEL_PROJECT_ID so the fallback secret matches across runtimes', async () => {
  const withProjectId = await deriveFallbackSecret({ VERCEL_PROJECT_ID: 'proj_123' });
  const withoutProjectId = await deriveFallbackSecret({});

  expect(withProjectId).toBe(withoutProjectId);
});
