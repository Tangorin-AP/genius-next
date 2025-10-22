import NextAuth from 'next-auth';
import type { Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { prisma, prismaReady } from '@/lib/prisma';
import { isPrismaSchemaMissingError } from '@/lib/prisma-errors';

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
        let user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
        try {
          user = await prisma.user.findUnique({ where: { email } });
        } catch (error) {
          if (isPrismaSchemaMissingError(error)) {
            console.error('Credentials authorize failed because the database schema is missing required tables.', error);
            return null;
          }
          throw error;
        }
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

type SignInMethod = typeof import('next-auth/react')['signIn'];

let cachedReactSignIn: SignInMethod | undefined;

const fallbackSignIn = (async (
  ...args: Parameters<SignInMethod>
) => {
  if (!cachedReactSignIn) {
    const mod = await import('next-auth/react');
    if (typeof mod.signIn !== 'function') {
      throw new Error('next-auth/react does not export a signIn helper.');
    }
    cachedReactSignIn = mod.signIn;
  }

  return cachedReactSignIn(...args) as ReturnType<SignInMethod>;
}) as SignInMethod;

type NextAuthReturn =
  | NextAuthRouteHandler
  | {
      handlers: NextAuthHandlers;
      auth?: () => Promise<Session | null>;
      signIn?: SignInMethod;
    };

const nextAuthResult = NextAuth(authConfig as any) as NextAuthReturn;

type NormalizedNextAuth = {
  handlers: NextAuthHandlers;
  auth?: () => Promise<Session | null>;
  signIn?: SignInMethod;
};

const normalizedNextAuth: NormalizedNextAuth =
  typeof nextAuthResult === 'function'
    ? {
        handlers: {
          GET: (request, context) => nextAuthResult(request, context as any),
          POST: (request, context) => nextAuthResult(request, context as any),
        },
      }
    : nextAuthResult;

const { handlers, auth: modernAuth, signIn: builtinSignIn } = normalizedNextAuth;

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

export const { GET, POST } = handlers;
export const signIn = builtinSignIn ?? fallbackSignIn;
