
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;

export function nextDueFromScore(score: number): Date {
  const s = Math.pow(5, Math.max(0, score));
  return new Date(Date.now() + s * SEC);
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

  const buckets = new Map<number, AssociationRecord[]>();
  for (const assoc of associations) {
    const key = Math.max(0, assoc.score ?? 0);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(assoc);
    else buckets.set(key, [assoc]);
  }

  for (const [key, items] of buckets.entries()) {
    const shuffled = fisherYates(items);
    shuffled.sort((a, b) => {
      const weightA = importanceOf(a);
      const weightB = importanceOf(b);
      if (weightA === weightB) return 0;
      return weightA > weightB ? -1 : 1;
    });
    buckets.set(key, shuffled);
  }

  const bucketKeys = [...buckets.keys()].sort((a, b) => a - b);
  const selected: AssociationRecord[] = [];

  while (selected.length < count) {
    const availableBuckets = bucketKeys
      .map((key) => ({ key, items: buckets.get(key)! }))
      .filter(({ items }) => items.length > 0);

    if (availableBuckets.length === 0) break;

    const weights = availableBuckets.map(({ key }) => poissonValue(key, Math.max(0, mValue)));
    const totalWeight = weights.reduce((acc, value) => acc + value, 0);

    if (totalWeight <= 0) {
      for (const bucket of availableBuckets) {
        while (bucket.items.length && selected.length < count) {
          selected.push(bucket.items.shift()!);
        }
      }
      break;
    }

    let ticket = Math.random() * totalWeight;
    let chosenIndex = 0;
    for (let i = 0; i < availableBuckets.length; i += 1) {
      const weight = weights[i];
      if (ticket < weight) {
        chosenIndex = i;
        break;
      }
      ticket -= weight;
    }

    const bucket = availableBuckets[chosenIndex];
    const picked = bucket.items.shift();
    if (picked) selected.push(picked);
  }

  return selected;
}

export async function chooseAssociations({ deckId, count, minimumScore = -1, mValue = 1 }: ChooseOptions): Promise<SessionPlan> {
  const associations = await prisma.association.findMany({
    where: { pair: { deckId } },
    include: { pair: true },
  });

  const now = new Date();
  const dueQueue: { assoc: AssociationRecord; dueDate: Date | null }[] = [];
  const unscheduled: AssociationRecord[] = [];

  for (const assoc of associations) {
    const pair = assoc.pair as { disabled?: boolean } | null;
    if (pair && pair.disabled) continue;
    const score = typeof assoc.score === 'number' ? assoc.score : -1;
    if (score < minimumScore) continue;

    const dueDate = assoc.dueAt ? new Date(assoc.dueAt) : null;
    const clone: AssociationRecord = {
      ...assoc,
      score,
      dueAt: dueDate,
    };

    if (dueDate) {
      if (dueDate.getTime() <= now.getTime()) {
        clone.dueAt = null;
      }
      dueQueue.push({ assoc: clone, dueDate });
    }

    if (!dueDate || dueDate.getTime() <= now.getTime()) {
      unscheduled.push(clone);
    }
  }

  dueQueue.sort((a, b) => {
    const aTime = a.dueDate ? a.dueDate.getTime() : -Infinity;
    const bTime = b.dueDate ? b.dueDate.getTime() : -Infinity;
    return aTime - bTime;
  });

  const dueIds = new Set(dueQueue.map(({ assoc }) => assoc.id));
  const poolCandidates = unscheduled.filter((assoc) => !dueIds.has(assoc.id));
  const available = poolCandidates.length;
  const requested = Math.min(Math.max(0, count), available);
  const sampled = chooseByScore(poolCandidates, requested, mValue);

  const dueViews = dueQueue.map(({ assoc }) => toAssocView(assoc));
  const poolViews = sampled.map(toAssocView);

  return { due: dueViews, pool: poolViews, available, requested };
}

function toAssocView(a: AssociationRecord): AssocView {
  const direction = a.direction as Direction;
  const question = direction === 'AB' ? a.pair.question : a.pair.answer;
  const answer = direction === 'AB' ? a.pair.answer : a.pair.question;
  const score = a.score;
  return {
    id: a.id,
    pairId: a.pairId,
    direction,
    question,
    answer,
    score: score,
    dueAt: a.dueAt,
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

  if (mark === 'SKIP') {
    await prisma.association.update({
      where: { id: association.id },
      data: {
        score: -1,
        dueAt: null,
        firstTime: true,
      },
    });
    return deckId;
  }

  if (mark === 'RIGHT') {
    const currentScore = association.score;
    const newScore = currentScore < 0 ? 0 : currentScore + 1;
    await prisma.association.update({
      where: { id: association.id },
      data: {
        score: newScore,
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
