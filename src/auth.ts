import NextAuth from 'next-auth';
import type { Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

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
        await prismaReady;
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

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

export const { GET, POST } = handlers;
