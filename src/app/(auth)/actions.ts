'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

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

function isCredentialsSigninError(error: unknown): error is AuthLikeError & { type: 'CredentialsSignin' } {
  return (
    error instanceof Error &&
    typeof (error as AuthLikeError).type === 'string' &&
    (error as AuthLikeError).type === 'CredentialsSignin'
  );
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

type SignInResponseLike = {
  error?: unknown;
  ok?: unknown;
  status?: unknown;
  url?: unknown;
};

function extractSignInError(result: unknown): string | undefined {
  if (!result) {
    return undefined;
  }

  let url: string | undefined;

  if (typeof result === 'string') {
    url = result;
  } else if (typeof result === 'object') {
    const candidate = result as SignInResponseLike;

    if (typeof candidate.error === 'string' && candidate.error.length > 0) {
      return candidate.error;
    }

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

function didSignInSucceed(result: unknown): boolean {
  if (!result) {
    return false;
  }

  if (typeof result === 'string') {
    return true;
  }

  if (typeof result === 'object') {
    const candidate = result as SignInResponseLike;

    if (typeof candidate.error === 'string' && candidate.error.length > 0) {
      return false;
    }

    if (candidate.ok === false) {
      return false;
    }

    return typeof candidate.url === 'string' && candidate.url.length > 0;
  }

  return false;
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
      if (signInError) {
        console.error('Unexpected error returned from automatic sign-in after registration.', signInError, signInResult);
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }

      if (!didSignInSucceed(signInResult)) {
        console.error('Automatic sign-in did not return a redirect URL after registration.', signInResult);
        return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
      }

      redirect(callbackUrl);
    } catch (error) {
      if (isPrismaSchemaMissingError(error)) {
        console.error('Automatic sign-in failed because the database schema is missing required tables.', error);
        return DATABASE_NOT_CONFIGURED;
      }
      if (isCredentialsSigninError(error)) {
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
    if (signInError) {
      console.error('Unexpected error returned from sign-in.', signInError, signInResult);
      return { error: 'Unable to sign in. Please try again.' };
    }

    if (!didSignInSucceed(signInResult)) {
      console.error('Sign-in did not return a redirect URL.', signInResult);
      return { error: 'Unable to sign in. Please try again.' };
    }

    redirect(callbackUrl);
  } catch (error) {
    if (isPrismaSchemaMissingError(error)) {
      console.error('Login failed because the database schema is missing required tables.', error);
      return DATABASE_NOT_CONFIGURED;
    }
    if (isCredentialsSigninError(error)) {
      return { error: 'Invalid email or password.' };
    }
    throw error;
  }

  return {};
}

export async function logoutAction() {
  redirect('/api/auth/signout');
}
