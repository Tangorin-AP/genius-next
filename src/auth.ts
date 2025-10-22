import NextAuth from 'next-auth';
import type { Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { prisma, prismaReady } from '@/lib/prisma';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

const authConfig = {
  session: { strategy: 'jwt' as const },
  pages: {
    signIn: '/login',
  },
  ...(secret ? { secret } : {}),
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (rawCredentials) => {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        await prismaReady();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: any }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        if ('image' in user) {
          token.picture = user.image;
        }
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      const tokenId = typeof token.id === 'string' ? token.id : typeof token.sub === 'string' ? token.sub : undefined;

      if (session.user) {
        if (tokenId) {
          session.user.id = tokenId;
        }
        if (typeof token.name === 'string') {
          session.user.name = token.name;
        }
        if (typeof token.email === 'string') {
          session.user.email = token.email;
        }
        if (token.picture) {
          session.user.image = String(token.picture);
        }
      } else if (tokenId) {
        session.user = {
          id: tokenId,
          name: typeof token.name === 'string' ? token.name : undefined,
          email: typeof token.email === 'string' ? token.email : '',
          image: token.picture ? String(token.picture) : undefined,
        };
      }

      return session;
    },
  },
};

type NextAuthRouteParams = { params: { nextauth: string[] } };

type NextAuthRouteHandler = (request: NextRequest, context: NextAuthRouteParams) => Promise<Response>;

type NextAuthHandlers = {
  GET: NextAuthRouteHandler;
  POST: NextAuthRouteHandler;
};

type NextAuthReturn =
  | NextAuthRouteHandler
  | {
      handlers: NextAuthHandlers;
      auth?: () => Promise<Session | null>;
    };

const nextAuthResult = NextAuth(authConfig as any) as NextAuthReturn;

const handlers: NextAuthHandlers =
  typeof nextAuthResult === 'function'
    ? {
        GET: (request, context) => nextAuthResult(request, context as any),
        POST: (request, context) => nextAuthResult(request, context as any),
      }
    : nextAuthResult.handlers;

const modernAuth =
  typeof nextAuthResult === 'function'
    ? undefined
    : typeof nextAuthResult.auth === 'function'
      ? nextAuthResult.auth
      : undefined;

type GetServerSession = (authOptions: unknown) => Promise<Session | null>;

let cachedGetServerSession: GetServerSession | undefined;

function isModuleNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ((error as { code?: string }).code === 'MODULE_NOT_FOUND' ||
      (error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND')
  );
}

async function loadGetServerSession(): Promise<GetServerSession> {
  if (cachedGetServerSession) return cachedGetServerSession;

  const tryImport = async (load: () => Promise<any>) => {
    try {
      const mod = (await load()) as { getServerSession?: unknown };
      if (typeof mod.getServerSession === 'function') {
        return mod.getServerSession as GetServerSession;
      }
      return undefined;
    } catch (error) {
      if (isModuleNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  };

  if (!cachedGetServerSession) {
    const primary = () => import('next-auth');
    const fallback = () => import('next-auth/next');

    cachedGetServerSession =
      (await tryImport(primary)) ?? (await tryImport(fallback)) ?? undefined;
  }

  if (!cachedGetServerSession) {
    throw new Error('getServerSession is not available in the installed version of next-auth.');
  }

  return cachedGetServerSession;
}

export async function auth() {
  if (modernAuth) {
    return modernAuth();
  }

  const getSession = await loadGetServerSession();
  return getSession(authConfig);
}

function baseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.NEXTAUTH_URL_INTERNAL) return process.env.NEXTAUTH_URL_INTERNAL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function serializeCookies(): string | undefined {
  const all = cookies().getAll();
  if (all.length === 0) return undefined;
  return all.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function applyResponseCookies(response: Response): void {
  const header = response.headers as Headers & { getSetCookie?: () => string[] };
  const rawCookies = header.getSetCookie ? header.getSetCookie() : header.get('set-cookie') ? [header.get('set-cookie') as string] : [];
  if (rawCookies.length === 0) return;

  const store = cookies();
  for (const raw of rawCookies) {
    const segments = raw.split(';').map((segment) => segment.trim()).filter(Boolean);
    if (segments.length === 0) continue;
    const [namePart, ...attributeParts] = segments;
    const [name, ...valueParts] = namePart.split('=');
    const value = valueParts.join('=');
    const options: Record<string, unknown> = {};

    for (const attribute of attributeParts) {
      const [key, ...rest] = attribute.split('=');
      const normalizedKey = key.toLowerCase();
      const attrValue = rest.join('=');
      if (normalizedKey === 'path') options.path = attrValue;
      else if (normalizedKey === 'samesite') options.sameSite = attrValue.toLowerCase();
      else if (normalizedKey === 'httponly') options.httpOnly = true;
      else if (normalizedKey === 'secure') options.secure = true;
      else if (normalizedKey === 'expires') {
        const date = new Date(attrValue);
        if (!Number.isNaN(date.getTime())) options.expires = date;
      } else if (normalizedKey === 'max-age') {
        const maxAge = Number.parseInt(attrValue, 10);
        if (Number.isFinite(maxAge)) options.maxAge = maxAge;
      }
    }

    store.set(name, value, options as any);
  }
}

async function callAuthHandler(path: string[], init: RequestInit = {}): Promise<Response> {
  const url = new URL(`/api/auth/${path.join('/')}`, baseUrl());
  const headersInit = new Headers(init.headers);
  const serialized = serializeCookies();
  if (serialized && !headersInit.has('cookie')) {
    headersInit.set('cookie', serialized);
  }

  const request = new NextRequest(url, {
    method: init.method ?? 'GET',
    headers: headersInit,
    body: init.body as any,
  });
  const method = (init.method ?? 'GET').toUpperCase();
  const handler = method === 'POST' ? handlers.POST : handlers.GET;
  const response = await handler(request, { params: { nextauth: path } });
  applyResponseCookies(response);
  return response;
}

export async function signIn(
  provider: string,
  options: Record<string, unknown> & { redirectTo?: string } = {},
): Promise<void> {
  if (provider !== 'credentials') {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const csrfResponse = await callAuthHandler(['csrf']);
  const csrfPayload = await csrfResponse.json();
  const csrfToken = csrfPayload?.csrfToken;
  if (!csrfToken) {
    const error = new Error('CredentialsSignin');
    (error as any).type = 'CredentialsSignin';
    throw error;
  }

  const callbackUrl =
    typeof options.redirectTo === 'string' && options.redirectTo.trim() !== ''
      ? options.redirectTo
      : typeof options.callbackUrl === 'string'
        ? options.callbackUrl
        : '/';

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (key === 'redirectTo') continue;
    form.append(key, String(value));
  }
  form.set('csrfToken', csrfToken);
  form.set('callbackUrl', callbackUrl);
  form.set('json', 'true');

  const response = await callAuthHandler(['callback', provider], {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: form,
  });

  const result = await response.json();
  const url = typeof result?.url === 'string' ? result.url : callbackUrl;
  const errorParam = new URL(url, baseUrl()).searchParams.get('error');

  if (errorParam) {
    const error = new Error(errorParam);
    (error as any).type = errorParam;
    throw error;
  }

  redirect(url);
}

export const { GET, POST } = handlers;
