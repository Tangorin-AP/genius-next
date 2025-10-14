
import { NextResponse } from 'next/server';
import { databaseUrl, prisma } from '@/lib/prisma';

export async function GET() {
  const hasUrl = Boolean(databaseUrl);
  try {
    // lightweight DB ping
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, hasDatabaseUrl: hasUrl, db: 'ok' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, hasDatabaseUrl: hasUrl, error: e?.message || String(e) }, { status: 500 });
  }
}
