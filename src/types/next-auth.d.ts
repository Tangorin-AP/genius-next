import type { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: NonNullable<DefaultSession['user']> & {
      id: string;
    };
  }

  interface User extends DefaultUser {
    passwordHash?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
