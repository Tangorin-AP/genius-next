import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as env from '@/lib/env';

const prismaUser = {
  findUnique: vi.fn(),
  create: vi.fn(),
};

const consumeRateLimitMock = vi.fn(() => true);
const remainingMsMock = vi.fn(() => 0);
const signInMock = vi.fn();
const headersMock = vi.fn(() => ({
  get: () => null,
}));
const redirectMock = vi.fn();
const bcryptHashMock = vi.fn(async () => 'hashed');

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: prismaUser,
  },
  prismaReady: Promise.resolve(),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: consumeRateLimitMock,
  remainingMs: remainingMsMock,
}));

vi.mock('@/auth', () => ({
  signIn: signInMock,
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: bcryptHashMock,
  },
}));

const { loginAction, registerAction } = await import('../actions');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

describe('auth actions database configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_DATABASE_URL !== undefined) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (ORIGINAL_AUTH_SECRET !== undefined) {
      process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
    } else {
      delete process.env.AUTH_SECRET;
    }
    if (ORIGINAL_NEXTAUTH_SECRET !== undefined) {
      process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET;
    } else {
      delete process.env.NEXTAUTH_SECRET;
    }
  });

  it('returns a friendly error when the database is not configured', async () => {
    const assertSpy = vi.spyOn(env, 'assertDatabaseUrl');

    const formData = new FormData();
    formData.set('name', 'Example User');
    formData.set('email', 'user@example.com');
    formData.set('password', 'password123');

    const result = await registerAction({}, formData);

    expect(result).toEqual({
      error: 'The application database is not configured. Please try again later.',
    });
    expect(assertSpy).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(prismaUser.findUnique).not.toHaveBeenCalled();
    expect(prismaUser.create).not.toHaveBeenCalled();

    assertSpy.mockRestore();
  });
});

describe('auth actions authentication configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_DATABASE_URL !== undefined) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (ORIGINAL_AUTH_SECRET !== undefined) {
      process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
    } else {
      delete process.env.AUTH_SECRET;
    }
    if (ORIGINAL_NEXTAUTH_SECRET !== undefined) {
      process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET;
    } else {
      delete process.env.NEXTAUTH_SECRET;
    }
  });

  it('returns a friendly error when the authentication secret is not configured', async () => {
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password123');

    const result = await loginAction({}, formData);

    expect(result).toEqual({
      error: 'Authentication is not configured. Please try again later.',
    });
    expect(signInMock).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });
});
