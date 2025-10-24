import NextAuth from 'next-auth';
import type { NextAuthConfig, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { prisma, prismaReady } from '@/lib/prisma';
import { ensureAuthSecretForRuntime } from '@/lib/env';

const { secret: authSecret } = ensureAuthSecretForRuntime();

export const authConfig: NextAuthConfig = {
debug: true, // remove after you confirm it's fixed
  trustHost: true,
  secret: authSecret,
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({
      token,
      user,
    }: {
      token: JWT & { id?: string };
      user?: { id?: string | null } | null;
    }) {
      if (user?.id) {
        token.id = user.id;
      }

      const subject = (token as { sub?: unknown }).sub;
      if (typeof subject === 'string' && !token.id) {
        token.id = subject;
      }

      return token;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT & { id?: string };
    }) {
      if (session.user && token?.id) {
        session.user.id = String(token.id);
      }

      return session;
    },
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await prismaReady();
        const email = typeof credentials?.email === 'string' ? credentials.email.trim() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || !password) {
          return null;
        }

        const normalizedEmail = email.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email ?? normalizedEmail,
          name: user.name ?? undefined,
        };
      },
    }),
  ],
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export const { GET, POST } = handlers;

