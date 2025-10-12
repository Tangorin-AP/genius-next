
import { NextResponse } from 'next/server';
import { chooseAssociations } from '@/lib/engine';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get('deckId');
  const m = Number(searchParams.get('m') ?? '0');
  const min = Number(searchParams.get('min') ?? '-1');
  const count = Number(searchParams.get('count') ?? '30');

  if (!deckId) return NextResponse.json([], { status: 400 });
  const items = await chooseAssociations({ deckId, count: Math.max(1, count), minimumScore: isNaN(min)?-1:min, mValue: isNaN(m)?0:m });
  return NextResponse.json(items);
}
