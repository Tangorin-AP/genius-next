
import { NextResponse } from 'next/server';
import { chooseAssociations } from '@/lib/engine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get('deckId');
  if (!deckId) return NextResponse.json([], { status: 400 });
  const items = await chooseAssociations({ deckId, count: 30, minimumScore: -1, mValue: 0 });
  return NextResponse.json(items);
}
