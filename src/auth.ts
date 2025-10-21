import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
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
    async jwt({ token, user }) {
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
    async session({ session, token }) {
      const tokenId = typeof token.id === 'string' ? token.id : typeof token.sub === 'string' ? token.sub : undefined;

      if (session.user) {
        if (tokenId) {
          session.user.id = tokenId;
        }
      } else if (tokenId) {
        session.user = {
          id: tokenId,
          name: token.name ?? null,
          email: token.email ?? null,
          image: token.picture ? String(token.picture) : null,
        };
      }

      return session;
    },
  },
});
