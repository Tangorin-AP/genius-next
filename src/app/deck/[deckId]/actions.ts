
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

export async function updatePair(pairId: string, data: { question?: string; answer?: string }) {
  await prisma.pair.update({ where: { id: pairId }, data });
}

export async function setScore(associationId: string, score: number) {
  await prisma.association.update({ where: { id: associationId }, data: { score, dueAt: score>=0 ? new Date(Date.now() + Math.pow(5, Math.max(0, score))*1000) : null } });
}

export async function importCSV(deckId: string, csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [q, ...rest] = line.split(',');
    const a = rest.join(',').trim();
    const p = await prisma.pair.create({ data: { deckId, question: q.trim(), answer: a } });
    await prisma.association.createMany({ data: [{ pairId: p.id, direction: 'AB' }, { pairId: p.id, direction: 'BA' }] });
  }
}

export async function exportJSON(deckId: string) {
  const pairs = await prisma.pair.findMany({ where: { deckId } });
  return JSON.stringify(pairs.map(p=>({ question: p.question, answer: p.answer })), null, 2);
}
