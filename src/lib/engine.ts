
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

function randomizeAssociations(list: AssociationRecord[]): AssociationRecord[] {
  return [...list].sort(() => (Math.random() < 0.5 ? -1 : 1));
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
  minScore: number,
  maxScore: number,
): AssociationRecord[] {
  if (associations.length === 0 || count <= 0) return [];
  if (associations.length <= count) return associations.slice(0, count);

  const bucketCount = maxScore - minScore + 1;
  const buckets: AssociationRecord[][] = Array.from({ length: bucketCount }, () => []);

  for (const assoc of associations) {
    const score = assoc.score;
    const index = Math.max(0, Math.min(bucketCount - 1, score - minScore));
    buckets[index].push(assoc);
  }

  const probabilities = buckets.map((_, bucketIndex) => poissonValue(bucketIndex, Math.max(0, mValue)));
  const totalProbability = probabilities.reduce((acc, value) => acc + value, 0);
  const selected: AssociationRecord[] = [];

  if (totalProbability <= 0) {
    for (const bucket of buckets) {
      for (const assoc of bucket) {
        if (selected.length >= count) return selected;
        selected.push(assoc);
      }
    }
    return selected;
  }

  let safety = 0;
  while (selected.length < count && safety < 5000) {
    safety++;
    let x = Math.random() * totalProbability;
    let chosenBucketIndex = -1;
    for (let b = 0; b < bucketCount; b++) {
      const weight = probabilities[b];
      if (weight <= 0) {
        continue;
      }
      if (x < weight) {
        chosenBucketIndex = b;
        break;
      }
      x -= weight;
    }

    if (chosenBucketIndex === -1) {
      const fallbackIndex = buckets.findIndex(bucket => bucket.length > 0);
      if (fallbackIndex === -1) break;
      selected.push(buckets[fallbackIndex].shift()!);
      continue;
    }

    const bucket = buckets[chosenBucketIndex];
    if (bucket.length === 0) {
      continue;
    }
    selected.push(bucket.shift()!);
  }

  if (selected.length < count) {
    for (const bucket of buckets) {
      while (bucket.length && selected.length < count) {
        selected.push(bucket.shift()!);
      }
    }
  }

  return selected;
}

export async function chooseAssociations({ deckId, count, minimumScore = -1, mValue = 1 }: ChooseOptions): Promise<AssocView[]> {
  const associations = await prisma.association.findMany({
    where: { pair: { deckId } },
    include: { pair: true },
  });

  const now = new Date();
  const eligible = associations.filter(assoc => assoc.score >= minimumScore);

  const due = eligible
    .filter(assoc => assoc.dueAt && assoc.dueAt <= now)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  if (due.length >= count) {
    return due.slice(0, count).map(toAssocView);
  }

  const remainingBudget = count - due.length;
  const pool = eligible.filter(assoc => !(assoc.dueAt && assoc.dueAt <= now));

  const randomized = randomizeAssociations(pool);
  const orderedByImportance = randomized.sort((a, b) => {
    const impA = importanceOf(a);
    const impB = importanceOf(b);
    if (impA === impB) return 0;
    return impA > impB ? -1 : 1;
  });

  let minScore = Infinity;
  let maxScore = -Infinity;
  for (const assoc of orderedByImportance) {
    minScore = Math.min(minScore, assoc.score);
    maxScore = Math.max(maxScore, assoc.score);
  }

  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
    minScore = 0;
    maxScore = 0;
  }

  const chosen = chooseByScore(orderedByImportance, remainingBudget, mValue, minScore, maxScore);
  const finalList = [...due, ...chosen].slice(0, count);
  return finalList.map(toAssocView);
}

function toAssocView(a: AssociationRecord): AssocView {
  const direction = a.direction as Direction;
  const question = direction === 'AB' ? a.pair.question : a.pair.answer;
  const answer = direction === 'AB' ? a.pair.answer : a.pair.question;
  const score = a.score;
  const seenBefore = a.firstTime === false;
  return {
    id: a.id,
    pairId: a.pairId,
    direction,
    question,
    answer,
    score,
    dueAt: a.dueAt,
    firstTime: !seenBefore || score <= 0,
  };
}

export async function mark(
  associationId: string,
  mark: 'RIGHT' | 'WRONG' | 'SKIP' | 'INTRO',
) {
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

  if (mark === 'INTRO') {
    const normalizedScore = Math.max(0, association.score);
    await prisma.association.update({
      where: { id: association.id },
      data: {
        score: normalizedScore,
        dueAt: nextDueFromScore(normalizedScore),
        firstTime: false,
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
