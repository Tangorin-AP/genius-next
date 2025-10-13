
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;

export function nextDueFromScore(score: number): Date {
  const safeScore = Math.max(0, score);
  const intervalSeconds = Math.pow(5, safeScore);
  return new Date(Date.now() + intervalSeconds * SEC);
}

export interface ChooseOptions {
  deckId: string;
  count: number;
  minimumScore?: number;
  mValue?: number;
}

export interface SessionPlan {
  due: AssocView[];
  pool: AssocView[];
  available: number;
  requested: number;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let value = 1;
  for (let i = 2; i <= n; i++) {
    value *= i;
    if (!Number.isFinite(value)) break;
  }
  return value;
}

function poissonValue(x: number, m: number): number {
  if (m <= 0) {
    return x === 0 ? 1 : 0;
  }
  const numerator = Math.pow(m, x);
  const denom = factorial(x);
  return (denom === 0 ? 0 : numerator / denom) * Math.exp(-m);
}

type AssociationRecord = Prisma.AssociationGetPayload<{ include: { pair: true } }>;

function scoreValue(assoc: { score: number | null }): number {
  const raw = assoc.score;
  return typeof raw === 'number' ? raw : -1;
}

function fisherYates<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function importanceOf(assoc: AssociationRecord): number {
  const pair = assoc.pair as { importance?: number };
  const value = pair?.importance;
  return typeof value === 'number' ? value : 0;
}

function chooseByScore(
  associations: AssociationRecord[],
  count: number,
  mValue: number,
): AssociationRecord[] {
  if (associations.length === 0 || count <= 0) return [];

  const ordered = fisherYates(associations).sort((a, b) => {
    const impA = importanceOf(a);
    const impB = importanceOf(b);
    if (impA === impB) return 0;
    return impA > impB ? -1 : 1;
  });

  let minimumScore = Number.POSITIVE_INFINITY;
  let maximumScore = Number.NEGATIVE_INFINITY;
  const resolvedScores: number[] = [];

  for (const assoc of ordered) {
    const score = scoreValue(assoc);
    resolvedScores.push(score);
    if (score < minimumScore) minimumScore = score;
    if (score > maximumScore) maximumScore = score;
  }

  if (!Number.isFinite(minimumScore) || !Number.isFinite(maximumScore)) {
    minimumScore = 0;
    maximumScore = 0;
  }

  const bucketCount = Math.max(1, Math.floor(maximumScore - minimumScore + 1));
  const buckets: AssociationRecord[][] = Array.from({ length: bucketCount }, () => []);

  for (let i = 0; i < ordered.length; i += 1) {
    const score = resolvedScores[i];
    const index = Math.max(0, Math.min(bucketCount - 1, score - minimumScore));
    buckets[index].push(ordered[i]);
  }

  const safeM = Math.max(0, mValue);
  const weights = buckets.map((_, idx) => poissonValue(idx, safeM));
  const desired = Math.min(count, ordered.length);
  const selected: AssociationRecord[] = [];

  const hasRemaining = () => buckets.some((bucket) => bucket.length > 0);

  while (selected.length < desired && hasRemaining()) {
    let x = Math.random();
    let chosen: AssociationRecord | null = null;

    for (let idx = 0; idx < buckets.length; idx += 1) {
      const weight = weights[idx];
      if (x < weight) {
        const bucket = buckets[idx];
        if (bucket.length > 0) {
          chosen = bucket.shift()!;
          break;
        }
      }
      x -= weight;
    }

    if (chosen) {
      selected.push(chosen);
      continue;
    }
  }

  return selected;
}

export async function chooseAssociations({ deckId, count, minimumScore = -1, mValue = 1 }: ChooseOptions): Promise<SessionPlan> {
  const associations = await prisma.association.findMany({
    where: {
      pair: { deckId },
      direction: 'AB',
    },
    include: { pair: true },
  });

  const now = new Date();
  const dueQueue: { assoc: AssociationRecord; dueDate: Date | null }[] = [];
  const unscheduled: AssociationRecord[] = [];

  for (const assoc of associations) {
    const pair = assoc.pair as { importance?: number } | null;
    const importance = typeof pair?.importance === 'number' ? pair.importance : 0;
    if (importance === -1) continue;

    const score = scoreValue(assoc);
    if (score < minimumScore) continue;

    const dueDate = assoc.dueAt ? new Date(assoc.dueAt) : null;
    const clone: AssociationRecord = {
      ...assoc,
      score,
      dueAt: dueDate,
    };

    if (dueDate) {
      const activeDueDate = dueDate.getTime() > now.getTime() ? dueDate : null;
      dueQueue.push({ assoc: clone, dueDate: activeDueDate });
      if (!activeDueDate) {
        clone.dueAt = null;
        unscheduled.push(clone);
      }
    } else {
      unscheduled.push(clone);
    }
  }

  dueQueue.sort((a, b) => {
    const aTime = a.dueDate ? a.dueDate.getTime() : Number.NEGATIVE_INFINITY;
    const bTime = b.dueDate ? b.dueDate.getTime() : Number.NEGATIVE_INFINITY;
    return aTime - bTime;
  });

  const dueIds = new Set(dueQueue.map(({ assoc }) => assoc.id));
  const poolCandidates = unscheduled.filter((assoc) => !dueIds.has(assoc.id));
  const available = poolCandidates.length;
  const requested = Math.min(Math.max(0, count), available);
  const sampled = chooseByScore(poolCandidates, requested, mValue);

  const dueViews = dueQueue.map(({ assoc, dueDate }) => toAssocView({ ...assoc, dueAt: dueDate ?? null }));
  const poolViews = sampled.map(toAssocView);

  return { due: dueViews, pool: poolViews, available, requested };
}

function toAssocView(a: AssociationRecord): AssocView {
  const direction = a.direction as Direction;
  const question = direction === 'AB' ? a.pair.question : a.pair.answer;
  const answer = direction === 'AB' ? a.pair.answer : a.pair.question;
  const score = scoreValue(a);
  return {
    id: a.id,
    pairId: a.pairId,
    direction,
    question,
    answer,
    score,
    dueAt: a.dueAt ?? null,
    firstTime: score < 0,
  };
}

export async function mark(associationId: string, mark: 'RIGHT' | 'WRONG' | 'SKIP') {
  const association = await prisma.association.findUnique({
    where: { id: associationId },
    include: { pair: true },
  });
  if (!association) return null;

  const deckId = association.pair.deckId;

  const currentScore = scoreValue(association);

  if (mark === 'SKIP') {
    await prisma.association.update({
      where: { id: association.id },
      data: {
        score: null as unknown as number,
        dueAt: null,
        firstTime: true,
      },
    });
    return deckId;
  }

  if (mark === 'RIGHT') {
    const newScore = currentScore + 1;
    const storedScore = newScore < 0 ? 0 : newScore;
    await prisma.association.update({
      where: { id: association.id },
      data: {
        score: storedScore,
        dueAt: nextDueFromScore(newScore),
        firstTime: false,
      },
    });
    return deckId;
  }

  await prisma.association.update({
    where: { id: association.id },
    data: {
      score: 0,
      dueAt: nextDueFromScore(0),
      firstTime: false,
    },
  });
  return deckId;
}
