
import type { Prisma } from '@prisma/client';
import { prisma, prismaReady } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;
const RANDOM_RANGE = 0x7fffffff;
const RANDOM_STATE_SIZE = 31;
const RANDOM_SEPARATION = 3;
const RANDOM_WARMUP = RANDOM_STATE_SIZE * 10;

export function nextDueFromScore(score: number): Date {
  const safeScore = Math.max(0, score);
  const intervalSeconds = Math.pow(5, safeScore);
  return new Date(Date.now() + intervalSeconds * SEC);
}

export interface ChooseOptions {
  deckId: string;
  userId: string;
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
  }
  return value;
}

function poissonValue(x: number, m: number): number {
  const numerator = Math.pow(m, x);
  const denom = factorial(x);
  return (denom === 0 ? 0 : numerator / denom) * Math.exp(-m);
}

type AssociationRecord = Prisma.AssociationGetPayload<{ include: { pair: true } }>;

function scoreValue(assoc: { score: number | null }): number {
  const raw = assoc.score;
  return typeof raw === 'number' ? raw : -1;
}

function importanceOf(assoc: AssociationRecord): number {
  const pair = assoc.pair as { importance?: number };
  const value = pair?.importance;
  return typeof value === 'number' ? value : 0;
}

function normalizeSeed(rawSeed: number): number {
  const normalized = Math.abs(Math.trunc(rawSeed)) % RANDOM_RANGE;
  return normalized === 0 ? 1 : normalized;
}

function parseSeedFromEnv(): number | null {
  if (typeof process === 'undefined') return null;
  const raw = process.env.GENIUS_RANDOM_SEED;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return normalizeSeed(parsed);
}

function computeDefaultSeed(): number {
  const seconds = Math.floor(Date.now() / SEC);
  const pid = typeof process !== 'undefined' && typeof process.pid === 'number' ? process.pid : 1;
  const seed = seconds * pid;
  return normalizeSeed(seed);
}

class GeniusRandom {
  private state: Uint32Array;

  private fptr: number;

  private rptr: number;

  constructor(seed: number) {
    this.state = new Uint32Array(RANDOM_STATE_SIZE);
    this.fptr = RANDOM_SEPARATION;
    this.rptr = 0;
    this.seed(seed);
  }

  private seed(seed: number): void {
    let value = normalizeSeed(seed);
    this.state[0] = value;
    for (let i = 1; i < RANDOM_STATE_SIZE; i += 1) {
      value = this.parkMiller(value);
      this.state[i] = value;
    }
    this.fptr = RANDOM_SEPARATION;
    this.rptr = 0;
    for (let i = 0; i < RANDOM_WARMUP; i += 1) {
      this.nextInt();
    }
  }

  private parkMiller(previous: number): number {
    const hi = Math.floor(previous / 127773);
    const lo = previous % 127773;
    let next = 16807 * lo - 2836 * hi;
    if (next <= 0) {
      next += RANDOM_RANGE;
    }
    return next >>> 0;
  }

  nextInt(): number {
    const sum = (this.state[this.fptr] + this.state[this.rptr]) >>> 0;
    this.state[this.fptr] = sum;
    const value = (sum >>> 1) & RANDOM_RANGE;
    this.fptr = (this.fptr + 1) % RANDOM_STATE_SIZE;
    this.rptr = (this.rptr + 1) % RANDOM_STATE_SIZE;
    return value;
  }

  nextFloat(): number {
    return this.nextInt() / RANDOM_RANGE;
  }

  coinFlip(): boolean {
    return (this.nextInt() & 1) === 1;
  }
}

let sharedRandom: GeniusRandom | null = null;
let sharedSeed: number | null = null;
let sharedEnvKey: string | null = null;

function getRandomGenerator(): GeniusRandom {
  const envSeed = parseSeedFromEnv();
  const envKey = typeof process !== 'undefined' ? process.env.GENIUS_RANDOM_SEED ?? null : null;

  if (envSeed !== null) {
    if (!sharedRandom || sharedSeed !== envSeed) {
      sharedRandom = new GeniusRandom(envSeed);
      sharedSeed = envSeed;
    }
    sharedEnvKey = envKey;
    return sharedRandom;
  }

  if (!sharedRandom) {
    const seed = computeDefaultSeed();
    sharedRandom = new GeniusRandom(seed);
    sharedSeed = seed;
    sharedEnvKey = null;
    return sharedRandom;
  }

  if (envKey !== sharedEnvKey) {
    // Environment variable cleared after being set; restore default seeded generator.
    const seed = computeDefaultSeed();
    sharedRandom = new GeniusRandom(seed);
    sharedSeed = seed;
    sharedEnvKey = null;
  }

  return sharedRandom;
}

export function setGeniusRandomSeed(seed: number | null): void {
  if (seed === null) {
    sharedRandom = null;
    sharedSeed = null;
    sharedEnvKey = typeof process !== 'undefined' ? process.env.GENIUS_RANDOM_SEED ?? null : null;
    return;
  }
  const normalized = normalizeSeed(seed);
  sharedRandom = new GeniusRandom(normalized);
  sharedSeed = normalized;
  sharedEnvKey = typeof process !== 'undefined' ? process.env.GENIUS_RANDOM_SEED ?? null : null;
}

function chooseByScore(
  associations: AssociationRecord[],
  count: number,
  mValue: number,
): AssociationRecord[] {
  if (associations.length === 0 || count <= 0) return [];

  const rng = getRandomGenerator();
  const randomized = [...associations].sort(() => (rng.coinFlip() ? -1 : 1));

  const ordered = randomized.sort((a, b) => {
    const impA = importanceOf(a);
    const impB = importanceOf(b);
    if (impA === impB) return 0;
    return impA > impB ? -1 : 1;
  });

  if (ordered.length <= count) {
    return ordered;
  }

  const scored = ordered.map((assoc) => ({ assoc, score: scoreValue(assoc) }));
  if (scored.length === 0) return [];

  let minScore = scored[0].score;
  let maxScore = scored[0].score;
  for (const entry of scored) {
    if (entry.score < minScore) minScore = entry.score;
    if (entry.score > maxScore) maxScore = entry.score;
  }

  const bucketCount = Math.max(1, Math.trunc(maxScore - minScore) + 1);
  const buckets: AssociationRecord[][] = Array.from({ length: bucketCount }, () => []);

  for (const entry of scored) {
    const rawIndex = entry.score - minScore;
    const bucketIndex = Math.max(0, Math.min(bucketCount - 1, Math.floor(rawIndex)));
    buckets[bucketIndex].push(entry.assoc);
  }

  const weights = buckets.map((_, idx) => poissonValue(idx, mValue));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const normalizedWeights =
    totalWeight > 0 ? weights.map((value) => value / totalWeight) : buckets.map(() => 1 / bucketCount);

  const desired = Math.min(count, ordered.length);
  const selected: AssociationRecord[] = [];

  while (selected.length < desired) {
    let x = rng.nextFloat();
    let chosen: AssociationRecord | null = null;
    for (let idx = 0; idx < buckets.length; idx += 1) {
      const weight = normalizedWeights[idx];
      if (weight <= 0) continue;
      if (x < weight) {
        const bucket = buckets[idx];
        if (bucket.length > 0) {
          chosen = bucket.shift() ?? null;
        }
        break;
      }
      x -= weight;
    }

    if (chosen) {
      selected.push(chosen);
      continue;
    }

    const fallbackIndex = buckets.findIndex((bucket) => bucket.length > 0);
    if (fallbackIndex === -1) {
      break;
    }
    selected.push(buckets[fallbackIndex].shift()!);
  }

  return selected;
}

export async function chooseAssociations({ deckId, userId, count, minimumScore = -1, mValue = 1 }: ChooseOptions): Promise<SessionPlan> {
  await prismaReady();
  const associations = await prisma.association.findMany({
    where: {
      pair: { deckId, deck: { userId } },
      direction: 'AB',
    },
    include: { pair: true },
  });

  const eligible: AssociationRecord[] = [];
  for (const assoc of associations) {
    const importance = importanceOf(assoc);
    if (importance === -1) continue;

    const score = scoreValue(assoc);
    if (score < minimumScore) continue;

    const clone: AssociationRecord = {
      ...assoc,
      score,
      dueAt: assoc.dueAt ? new Date(assoc.dueAt) : null,
    };
    eligible.push(clone);
  }

  const available = eligible.length;
  const requested = Math.min(Math.max(0, count), available);
  const sampled = chooseByScore(eligible, requested, mValue);
  const poolViews = sampled.map(toAssocView);

  return { due: [], pool: poolViews, available, requested };
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

export async function mark(userId: string, associationId: string, decision: 'RIGHT' | 'WRONG' | 'SKIP') {
  await prismaReady();
  const association = await prisma.association.findFirst({
    where: { id: associationId, pair: { deck: { userId } } },
    include: { pair: true },
  });
  if (!association) return null;

  const deckId = association.pair.deckId;

  const currentScore = scoreValue(association);

  if (decision === 'SKIP') {
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

  if (decision === 'RIGHT') {
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
