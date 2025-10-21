'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { signIn } from '@/auth';
import { prisma } from '@/lib/prisma';
import { assertDatabaseUrl } from '@/lib/env';
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

function isCredentialsSigninError(error: unknown): error is { type: 'CredentialsSignin' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'CredentialsSignin'
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

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  assertDatabaseUrl();
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: 'An account with that email already exists.' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { name, email, passwordHash } });

  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl')) ?? '/';
  try {
    await signIn('credentials', { email, password, redirectTo: callbackUrl });
  } catch (error) {
    if (isCredentialsSigninError(error)) {
      return { error: 'Registration succeeded but automatic sign-in failed. Please log in.' };
    }
    throw error;
  }

  return {};
}

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  assertDatabaseUrl();
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
    const result = await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
    });
    if (result && 'error' in result && result.error) {
      return { error: 'Invalid email or password.' };
    }
  } catch (error) {
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
