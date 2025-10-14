
import { NextResponse } from 'next/server';
import { chooseAssociations } from '@/lib/engine';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get('deckId');
  const m = Number(searchParams.get('m') ?? '0');
  const min = Number(searchParams.get('min') ?? '-1');
  const countParam = searchParams.get('count');
  const count = countParam === null ? UNSCHEDULED_SAMPLE_COUNT : Number(countParam);

  if (!deckId) return NextResponse.json([], { status: 400 });
  const plan = await chooseAssociations({
    deckId,
    count: Math.max(1, Number.isNaN(count) ? UNSCHEDULED_SAMPLE_COUNT : count),
    minimumScore: Number.isNaN(min) ? -1 : min,
    mValue: Number.isNaN(m) ? 0 : m,
  });
  return NextResponse.json(plan);
}
