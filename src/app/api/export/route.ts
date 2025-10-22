
import { NextResponse } from 'next/server';
import { prisma, prismaReady } from '@/lib/prisma';
import { hasDatabaseUrl } from '@/lib/env';
import { auth } from '@/auth';

function escapeCSV(value: string) {
  const needsQuotes = /[",\n]/.test(value);
  const sanitized = value.replace(/"/g, '""');
  return needsQuotes ? `"${sanitized}"` : sanitized;
}

export async function GET(req: Request){
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { ok:false, error: 'DATABASE_URL environment variable is not set.' },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok:false, error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get('deckId');
  if (!deckId) return NextResponse.json({ ok:false, error: 'deckId required' }, { status: 400 });

  await prismaReady();

  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId: session.user.id }, select: { name: true } });
  if (!deck) {
    return NextResponse.json({ ok:false, error: 'Deck not found' }, { status: 404 });
  }

  const pairs = await prisma.pair.findMany({
    where: { deckId, deck: { userId: session.user.id } },
    orderBy: { createdAt: 'asc' },
  });
  const header = 'Question,Answer';
  const lines = pairs.map((pair) => `${escapeCSV(pair.question)},${escapeCSV(pair.answer)}`);
  const csv = [header, ...lines].join('\n');
  const slug = deck.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'deck';

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}.csv"`,
    }
  });
}
