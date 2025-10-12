
'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function addPair(deckId: string) {
  const p = await prisma.pair.create({ data: { deckId, question: '', answer: '' } });
  await prisma.association.createMany({
    data: [
      { pairId: p.id, direction: 'AB' },
      { pairId: p.id, direction: 'BA' },
    ]
  });
  revalidatePath(`/deck/${deckId}`);
}

export async function saveRow(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  const associationId = String(formData.get('associationId') ?? '');
  const question = String(formData.get('question') ?? '');
  const answer = String(formData.get('answer') ?? '');
  const scoreStr = formData.get('score');
  const score = (scoreStr === null || scoreStr === undefined || String(scoreStr).trim()==='')
    ? null
    : parseInt(String(scoreStr), 10);

  if (pairId) {
    await prisma.pair.update({ where: { id: pairId }, data: { question, answer } });
  }
  if (associationId && score !== null && !Number.isNaN(score)) {
    const s = Math.max(-1, Math.min(10, score));
    await prisma.association.update({
      where: { id: associationId },
      data: { score: s, dueAt: s >= 0 ? new Date(Date.now() + Math.pow(5, Math.max(0, s))*1000) : null }
    });
  }
  if (deckId) revalidatePath(`/deck/${deckId}`);
}

export async function deletePair(formData: FormData) {
  const deckId = String(formData.get('deckId') ?? '');
  const pairId = String(formData.get('pairId') ?? '');
  if (pairId) {
    await prisma.association.deleteMany({ where: { pairId } });
    await prisma.pair.delete({ where: { id: pairId } });
  }
  if (deckId) revalidatePath(`/deck/${deckId}`);
}

// New: server action specifically for Client Component notes form
export async function saveDeckNotesAction(deckId: string, formData: FormData) {
  const notes = String(formData.get('notes') || '');
  await prisma.deck.update({ where: { id: deckId }, data: { notes } });
  revalidatePath(`/deck/${deckId}`);
}
