
import { prisma } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;
export function nextDueFromScore(score: number): Date {
  const s = Math.pow(5, Math.max(0, score));
  return new Date(Date.now() + s*SEC);
}

// Pull associations from DB and prepare an enumerator selection
export interface ChooseOptions {
  deckId: string;
  count: number;         // like setCount:
  minimumScore?: number; // like setMinimumScore:
  mValue?: number;       // probability center (clean-room gaussian; in Genius this lives in enumerator)
}

function weight(score: number, mValue: number, sigma = 1.2): number {
  // Clean-room weighting: gaussian centered at mValue; unseen (-1) slightly boosted.
  if (score < 0) return 0.60; // nudge first-time into the mix
  const d = score - mValue;
  return Math.exp(-(d*d)/(2*sigma*sigma));
}

export async function chooseAssociations({ deckId, count, minimumScore=-1, mValue=0 }: ChooseOptions): Promise<AssocView[]> {
  // Fetch enabled pairs -> two directions. In this minimal build we keep all enabled.
  const associations = await prisma.association.findMany({
    where: { pair: { deckId } },
    include: { pair: true },
  });

  const now = new Date();
  // 1) immediately-due items first (review), in dueAt ascending
  const due = associations
    .filter(a => a.score >= minimumScore && a.dueAt && a.dueAt <= now)
    .sort((a,b) => (a.dueAt!.getTime() - b.dueAt!.getTime()));

  // 2) if we still need more, pick from pool weighted by score around mValue
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
    score: a.score,
    dueAt: a.dueAt,
    firstTime: a.firstTime,
  }));
}

export async function mark(associationId: string, mark: 'RIGHT'|'WRONG'|'SKIP') {
  const a = await prisma.association.findUnique({ where: { id: associationId } });
  if (!a) return;
  if (mark === 'SKIP') {
    await prisma.association.update({ where: { id: a.id }, data: { score: -1, dueAt: null, firstTime: true } });
    return;
  }
  if (mark === 'RIGHT') {
    const newScore = (a.score < 0 ? 0 : a.score) + 1;
    await prisma.association.update({ where: { id: a.id }, data: { score: newScore, dueAt: nextDueFromScore(newScore), firstTime: false } });
  } else {
    // WRONG
    const newScore = 0;
    await prisma.association.update({ where: { id: a.id }, data: { score: newScore, dueAt: nextDueFromScore(newScore), firstTime: false } });
  }
}
