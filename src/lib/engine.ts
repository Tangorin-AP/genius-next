
import { prisma } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;
export function nextDueFromScore(score: number): Date {
  const s = Math.pow(5, Math.max(0, score));
  return new Date(Date.now() + s*SEC);
}

export interface ChooseOptions {
  deckId: string;
  count: number;
  minimumScore?: number;
  mValue?: number;
}

function weight(score: number, mValue: number, sigma = 1.2): number {
  if (score < 0) return 0.60; // boost first-time items
  const d = score - mValue;
  return Math.exp(-(d*d)/(2*sigma*sigma));
}

export async function chooseAssociations({ deckId, count, minimumScore=-1, mValue=0 }: ChooseOptions): Promise<AssocView[]> {
  const associations = await prisma.association.findMany({
    where: { pair: { deckId }, direction: 'AB' },
    include: { pair: true },
  });

  const now = new Date();
  const due = associations
    .filter(a => a.score >= minimumScore && a.dueAt && a.dueAt <= now)
    .sort((a,b) => (a.dueAt!.getTime() - b.dueAt!.getTime()));

  const pool = associations
    .filter(a => (a.dueAt == null || a.dueAt > now) && a.score >= minimumScore);

  const weighted = pool
    .map(a => ({ a, w: weight(a.score, mValue) }))
    .sort((x,y) => y.w - x.w);

  const selected = [...due];
  for (const {a} of weighted) {
    if (selected.some(s => s.id === a.id)) continue;
    selected.push(a);
    if (selected.length >= count) break;
  }

  return selected.slice(0, count).map(a => ({
    id: a.id,
    pairId: a.pairId,
    direction: a.direction as Direction,
    question: a.direction === 'AB' ? a.pair.question : a.pair.answer,
    answer: a.direction === 'AB' ? a.pair.answer : a.pair.question,
    score: a.score < 0 ? 0 : a.score,
    dueAt: a.dueAt,
    firstTime: a.firstTime,
  }));
}

export async function mark(associationId: string, mark: 'RIGHT'|'WRONG'|'SKIP') {
  const a = await prisma.association.findUnique({ where: { id: associationId }, include: { pair: true } });
  if (!a) return null;
  const deckId = a.pair.deckId;
  if (mark === 'SKIP') {
    await prisma.association.update({
      where: { id: a.id },
      data: {
        dueAt: nextDueFromScore(Math.max(0, a.score)),
        firstTime: false,
      }
    });
    return;
  }
  if (mark === 'RIGHT') {
    const base = a.score < 0 ? 0 : a.score;
    const newScore = base + 1;
    await prisma.association.update({ where: { id: a.id }, data: { score: newScore, dueAt: nextDueFromScore(newScore), firstTime: false } });
  } else {
    const newScore = 0;
    await prisma.association.update({ where: { id: a.id }, data: { score: newScore, dueAt: nextDueFromScore(newScore), firstTime: false } });
  }
  return deckId;
}
