
import type { Prisma } from '@prisma/client';
import { prisma, prismaReady } from './prisma';
import { AssocView, Direction } from './types';

const SEC = 1000;
const RANDOM_RANGE = 0x7fffffff;
const RANDOM_STATE_SIZE = 31;
const RANDOM_SEPARATION = 3;
const RANDOM_WARMUP = RANDOM_STATE_SIZE * 10;
const BUCKET_COUNT = 11;

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

function bucketIndexForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }
  const scaled = Math.floor(score * 10);
  if (scaled < 0) return 0;
  if (scaled >= BUCKET_COUNT) return BUCKET_COUNT - 1;
  return scaled;
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

  const buckets: AssociationRecord[][] = Array.from({ length: BUCKET_COUNT }, () => []);

  for (const assoc of ordered) {
    const score = scoreValue(assoc);
    const bucketIndex = bucketIndexForScore(score);
    buckets[bucketIndex].push(assoc);
  }

  const weights = buckets.map((_, idx) => poissonValue(idx, mValue));
  const desired = Math.min(count, ordered.length);
  const selected: AssociationRecord[] = [];

  while (selected.length < desired) {
    let x = rng.nextFloat();
    let chosen: AssociationRecord | null = null;
    for (let idx = 0; idx < buckets.length; idx += 1) {
      const weight = weights[idx];
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

    let hasRemaining = false;
    for (const bucket of buckets) {
      if (bucket.length > 0) {
        hasRemaining = true;
        break;
      }
    }

    if (!hasRemaining) {
      break;
    }
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
