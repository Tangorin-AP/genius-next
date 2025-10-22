'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

import { signIn } from '@/auth';
import { prisma } from '@/lib/prisma';

type RegisterActionState = { error?: string };

function sanitizeCallbackUrl(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/')) return undefined;
  return value;
}

export async function registerAction(formData: FormData): Promise<RegisterActionState | void> {
  const rawEmail = typeof formData.get('email') === 'string' ? formData.get('email')!.trim() : '';
  const email = rawEmail.toLowerCase();
  const password = typeof formData.get('password') === 'string' ? formData.get('password')! : '';
  const nameValue = formData.get('name');
  const name = typeof nameValue === 'string' && nameValue.trim() ? nameValue.trim() : null;
  const callbackUrl = sanitizeCallbackUrl(formData.get('callbackUrl'));

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { error: 'An account with that email already exists.' };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
    },
  });

  const result = await signIn('credentials', {
    email,
    password,
    redirect: false,
  });

  if (result?.error) {
    return { error: 'Registration succeeded, but signing in failed. Please sign in manually.' };
  }

  redirect(callbackUrl ?? '/');
}
