
import { NextResponse } from 'next/server';
import { mark } from '@/lib/engine';

export async function POST(req: Request) {
  const body = await req.json();
  const { associationId, decision } = body || {};
  if (!associationId || !decision) return NextResponse.json({ ok: false }, { status: 400 });
  await mark(associationId, decision);
  return NextResponse.json({ ok: true });
}
