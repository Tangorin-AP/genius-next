
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

export async function saveDeckNotes(deckId: string, notes: string) {
  await prisma.deck.update({ where: { id: deckId }, data: { notes } });
}

export async function importCSV(deckId: string, csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [q, ...rest] = line.split(',');
    const a = rest.join(',').trim();
    const p = await prisma.pair.create({ data: { deckId, question: q.trim(), answer: a } });
    await prisma.association.createMany({ data: [{ pairId: p.id, direction: 'AB' }, { pairId: p.id, direction: 'BA' }] });
  }
  revalidatePath(`/deck/${deckId}`);
}

export async function exportJSON(deckId: string) {
  const pairs = await prisma.pair.findMany({ where: { deckId }, orderBy: { createdAt: 'asc' } });
  return JSON.stringify(pairs.map(p=>({ question: p.question, answer: p.answer })), null, 2);
}
