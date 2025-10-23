import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaReadyMock = vi.fn(async () => {});
const findUniqueMock = vi.fn();
const createMock = vi.fn();
const hashMock = vi.fn(async () => 'hashed-password');
const signInMock = vi.fn(async () => ({ error: undefined }));
const redirectMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prismaReady: prismaReadyMock,
  prisma: {
    user: {
      findUnique: findUniqueMock,
      create: createMock,
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: hashMock,
  },
}));

vi.mock('@/auth', () => ({
  signIn: signInMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

const { registerAction } = await import('../actions');

describe('registerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInMock.mockResolvedValue({ error: undefined });
  });

  it('returns an error when email or password is missing', async () => {
    const formData = new FormData();
    formData.set('email', '');
    formData.set('password', '');

    const result = await registerAction(formData);

    expect(result).toEqual({ error: 'Email and password are required.' });
    expect(prismaReadyMock).toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('returns an error when the email is already registered', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'user-id', email: 'user@example.com', passwordHash: 'hash' });

    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password123');

    const result = await registerAction(formData);

    expect(result).toEqual({ error: 'An account with that email already exists.' });
    expect(prismaReadyMock).toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('creates the user, signs in, and redirects on success', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.set('name', 'Example User');
    formData.set('email', 'User@Example.com');
    formData.set('password', 'password123');
    formData.set('callbackUrl', '/dashboard');

    await registerAction(formData);

    expect(prismaReadyMock).toHaveBeenCalled();
    expect(hashMock).toHaveBeenCalledWith('password123', 12);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        name: 'Example User',
        passwordHash: 'hashed-password',
      },
    });
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: 'user@example.com',
      password: 'password123',
      redirect: false,
    });
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to the homepage when no callback is provided', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password123');

    await registerAction(formData);

    expect(prismaReadyMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('returns an error if signing in after registration fails', async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });

    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'password123');

    const result = await registerAction(formData);

    expect(result).toEqual({ error: 'Registration succeeded, but signing in failed. Please sign in manually.' });
    expect(prismaReadyMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
