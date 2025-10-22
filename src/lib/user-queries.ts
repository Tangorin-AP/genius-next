import type { User } from '@prisma/client';

import { prisma } from './prisma';

const SELECT_FIELDS = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  passwordHash: true,
} as const;

export type BasicUser = Pick<User, keyof typeof SELECT_FIELDS>;

function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function findUserByEmailInsensitive(email: string): Promise<BasicUser | null> {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    return null;
  }

  const direct = await prisma.user.findFirst({
    where: { email: normalized },
    select: SELECT_FIELDS,
  });

  if (direct) {
    return direct;
  }

  const results = await prisma.$queryRaw<BasicUser[]>`
    SELECT "id", "name", "email", "emailVerified", "image", "passwordHash"
    FROM "User"
    WHERE LOWER("email") = LOWER(${email})
    LIMIT 1
  `;

  return results[0] ?? null;
}
