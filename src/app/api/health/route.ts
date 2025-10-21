
import { NextResponse } from 'next/server';
import { prisma, prismaReady } from '@/lib/prisma';
import { hasDatabaseUrl } from '@/lib/env';

export async function GET() {
  const hasUrl = hasDatabaseUrl();
  if (!hasUrl) {
    return NextResponse.json(
      { ok: false, hasDatabaseUrl: false, error: 'DATABASE_URL environment variable is not set.' },
      { status: 500 },
    );
  }
  try {
    await prismaReady;
    // lightweight DB ping
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, hasDatabaseUrl: hasUrl, db: 'ok' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, hasDatabaseUrl: hasUrl, error: e?.message || String(e) }, { status: 500 });
  }
}
