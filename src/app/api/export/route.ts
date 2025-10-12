
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request){
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get('deckId');
  if (!deckId) return NextResponse.json({ ok:false, error: 'deckId required' }, { status: 400 });
  const pairs = await prisma.pair.findMany({ where: { deckId }, orderBy: { createdAt: 'asc' } });
  const json = JSON.stringify(pairs.map(p=>({ question: p.question, answer: p.answer })), null, 2);
  return new NextResponse(json, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename="deck.json"',
    }
  });
}
