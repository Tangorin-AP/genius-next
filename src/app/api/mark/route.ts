
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { mark } from '@/lib/engine';
import { hasDatabaseUrl } from '@/lib/env';

export async function POST(req: Request) {
  const body = await req.json();
  const { associationId, decision } = body || {};
  if (!associationId || !decision) return NextResponse.json({ ok: false }, { status: 400 });
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, error: 'DATABASE_URL environment variable is not set.' }, { status: 503 });
  }
  const deckId = await mark(associationId, decision);
  if (deckId) {
    revalidatePath(`/deck/${deckId}`);
  }
  return NextResponse.json({ ok: true });
}
