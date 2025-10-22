'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { AuthError } from 'next-auth';

import { signIn } from '@/auth';
import { prisma, prismaReady } from '@/lib/prisma';
import { assertDatabaseUrl, ensureAuthSecret, isUsingFallbackDatabaseUrl } from '@/lib/env';
import { isPrismaSchemaMissingError } from '@/lib/prisma-errors';
import { consumeRateLimit, remainingMs } from '@/lib/rateLimit';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z
    .string()
    .email('A valid email is required')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

type ActionResult = {
  error?: string;
};

const DATABASE_NOT_CONFIGURED: ActionResult = {
  error: 'The application database is not configured. Please try again later.',
};

const AUTH_NOT_CONFIGURED: ActionResult = {
  error: 'Authentication is not configured. Please try again later.',
};

type AuthLikeError = Error & { type?: string };

const CLIENT_SAFE_AUTH_ERROR_TYPES = new Set([
  'CredentialsSignin',
  'OAuthAccountNotLinked',
  'OAuthCallbackError',
  'AccessDenied',
  'Verification',
  'MissingCSRF',
  'AccountNotLinked',
  'WebAuthnVerificationError',
]);

function isCredentialsSigninError(error: unknown): error is AuthLikeError & { type: 'CredentialsSignin' } {
  return (
    error instanceof Error &&
    typeof (error as AuthLikeError).type === 'string' &&
    (error as AuthLikeError).type === 'CredentialsSignin'
  );
}

function isAuthConfigurationError(error: unknown): error is AuthError {
  return error instanceof AuthError && !CLIENT_SAFE_AUTH_ERROR_TYPES.has(error.type);
}

function clientKey(prefix: string): string {
  const forwarded = headers().get('x-forwarded-for');
  const remote = forwarded ? forwarded.split(',')[0]?.trim() : null;
  const ip = remote && remote.length > 0 ? remote : 'local';
  return `${prefix}:${ip}`;
}

function sanitizeCallbackUrl(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/')) return undefined;
  return value;
}

function requestOrigin(): string | undefined {
  const headerList = headers();
  const forwardedProto = headerList.get('x-forwarded-proto');
  const forwardedHost = headerList.get('x-forwarded-host');
  const host = forwardedHost ?? headerList.get('host');

  if (!host) {
    return undefined;
  }

  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function resolveRedirectTarget(result: unknown, fallback: string): string {
  let url: string | undefined;

  if (typeof result === 'string') {
    url = result;
  } else if (result && typeof result === 'object') {
    const candidate = result as { url?: unknown };
    if (typeof candidate.url === 'string') {
      url = candidate.url;
    }
  }

  if (!url) {
    return fallback;
  }

  try {
    const origin = requestOrigin();
    if (!origin) {
      return fallback;
    }

    const parsed = new URL(url, origin);
    if (parsed.origin !== origin) {
      return fallback;
    }

    if (parsed.pathname.startsWith('/api/auth')) {
      return fallback;
    }

    const relative = `${parsed.pathname}${parsed.search}`;
    return sanitizeCallbackUrl(relative) ?? fallback;
  } catch {
    if (url.startsWith('/')) {
      return sanitizeCallbackUrl(url) ?? fallback;
    }
    return fallback;
  }
}

function extractSignInError(result: unknown): string | undefined {
  if (!result) {
    return undefined;
  }

  let url: string | undefined;

  if (typeof result === 'string') {
    url = result;
  } else if (typeof result === 'object' && result) {
    const candidate = result as { url?: unknown };
    if (typeof candidate.url === 'string') {
      url = candidate.url;
    }
  }

  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url, 'http://localhost:3000');
    return parsed.searchParams.get('error') ?? undefined;
  } catch {
    return undefined;
  }
}

function ensureDatabaseConfiguration(): ActionResult | null {
  if (process.env.NODE_ENV === 'production' && isUsingFallbackDatabaseUrl()) {
    return DATABASE_NOT_CONFIGURED;
  }

  assertDatabaseUrl();
  return null;
}

function ensureAuthConfiguration(): ActionResult | null {
  try {
    const secret = ensureAuthSecret();
    if (!secret || secret.trim() === '') {
      throw new Error('Authentication secret is empty.');
    }
  } catch (error) {
    console.error(error);
    return AUTH_NOT_CONFIGURED;
  }

  return null;
}

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  try {
    const dbError = ensureDatabaseConfiguration();
    if (dbError) {
      return dbError;
    }
    const authError = ensureAuthConfiguration();
    if (authError) {
      return authError;
    }
    const key = clientKey('register');
    if (!consumeRateLimit(key, 5, 60_000)) {
      const wait = Math.ceil(remainingMs(key) / 1000);
      return { error: `Too many attempts. Try again in ${wait} seconds.` };
    }

    const raw = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    };

    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }

    const { name, email, password } = parsed.data;

    await prismaReady();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: 'An account with that email already exists.' };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { name, email, passwordHash } });

    const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl')) ?? '/';
    try {
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirectTo: callbackUrl,
        redirect: false,
      });

      const signInError = extractSignInError(signInResult);
      if (signInError === 'CredentialsSignin') {
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }
      if (signInError === 'Configuration') {
        return AUTH_NOT_CONFIGURED;
      }
      if (signInError) {
        console.error('Unexpected error returned from automatic sign-in after registration.', signInError, signInResult);
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }

      if (!signInResult || typeof signInResult !== 'string') {
        console.error('Automatic sign-in did not return a redirect URL after registration.', signInResult);
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }

      const target = resolveRedirectTarget(signInResult, callbackUrl);
      redirect(target);
    } catch (error) {
      if (isPrismaSchemaMissingError(error)) {
        console.error('Automatic sign-in failed because the database schema is missing required tables.', error);
        return DATABASE_NOT_CONFIGURED;
      }
      if (isCredentialsSigninError(error)) {
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }
      if (error instanceof AuthError) {
        if (isAuthConfigurationError(error)) {
          console.error('Automatic sign-in failed due to authentication configuration.', error);
          return AUTH_NOT_CONFIGURED;
        }
        console.error('Automatic sign-in failed due to an unexpected authentication error.', error);
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }
      throw error;
    }

    return {};
  } catch (error) {
    if (isPrismaSchemaMissingError(error)) {
      console.error('Registration failed because the database schema is missing required tables.', error);
      return DATABASE_NOT_CONFIGURED;
    }
    throw error;
  }
}

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  const dbError = ensureDatabaseConfiguration();
  if (dbError) {
    return dbError;
  }
  const authError = ensureAuthConfiguration();
  if (authError) {
    return authError;
  }
  const key = clientKey('login');
  if (!consumeRateLimit(key, 10, 60_000)) {
    const wait = Math.ceil(remainingMs(key) / 1000);
    return { error: `Too many login attempts. Try again in ${wait} seconds.` };
  }

  const raw = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid login credentials.' };
  }

  const { email, password } = parsed.data;
  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl')) ?? '/';

  try {
    const signInResult = await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
      redirect: false,
    });

    const signInError = extractSignInError(signInResult);
    if (signInError === 'CredentialsSignin') {
      return { error: 'Invalid email or password.' };
    }
    if (signInError === 'Configuration') {
      return AUTH_NOT_CONFIGURED;
    }
    if (signInError) {
      console.error('Unexpected error returned from sign-in.', signInError, signInResult);
      return { error: 'Unable to sign in. Please try again.' };
    }

    if (!signInResult) {
      console.error('Sign-in did not return a redirect URL.');
      return { error: 'Unable to sign in. Please try again.' };
    }

    const target = resolveRedirectTarget(signInResult, callbackUrl);
    redirect(target);
  } catch (error) {
    if (isPrismaSchemaMissingError(error)) {
      console.error('Login failed because the database schema is missing required tables.', error);
      return DATABASE_NOT_CONFIGURED;
    }
    if (isCredentialsSigninError(error)) {
      return { error: 'Invalid email or password.' };
    }
    if (error instanceof AuthError) {
      if (isAuthConfigurationError(error)) {
        console.error('Login failed due to authentication configuration.', error);
        return AUTH_NOT_CONFIGURED;
      }
      console.error('Login failed due to an unexpected authentication error.', error);
      return { error: 'Unable to sign in. Please try again.' };
    }
    throw error;
  }

  return {};
}

export async function logoutAction() {
  redirect('/api/auth/signout');
}
