import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RawSessionPlan, SessionScheduler } from '../session';

function createPlan(): RawSessionPlan {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return {
    due: [
      {
        id: 'due-1',
        pairId: 'pair-1',
        direction: 'AB',
        question: 'Due question',
        answer: 'Due answer',
        score: 2,
        dueAt: new Date(now.getTime() - 5_000).toISOString(),
        firstTime: false,
      },
    ],
    pool: [
      {
        id: 'pool-1',
        pairId: 'pair-2',
        direction: 'AB',
        question: 'Pool question',
        answer: 'Pool answer',
        score: -1,
        dueAt: null,
        firstTime: true,
      },
    ],
    available: 1,
    requested: 1,
  };
}

function createMixedPlan(): RawSessionPlan {
  const base = createPlan();
  return {
    due: [
      base.due[0],
      {
        id: 'due-2',
        pairId: 'pair-3',
        direction: 'AB',
        question: 'Future due',
        answer: 'Future answer',
        score: 1,
        dueAt: new Date('2024-01-01T00:05:00.000Z').toISOString(),
        firstTime: false,
      },
    ],
    pool: [
      base.pool[0],
      {
        id: 'pool-2',
        pairId: 'pair-4',
        direction: 'AB',
        question: 'Pool later',
        answer: 'Pool later answer',
        score: 3,
        dueAt: null,
        firstTime: false,
      },
    ],
    available: 2,
    requested: 2,
  };
}

describe('SessionScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prefers due cards when random threshold is below review bias', () => {
    const plan = createMixedPlan();
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const scheduler = new SessionScheduler(plan, { reviewBias: 0.5 });
    const next = scheduler.next(new Date());
    expect(next?.id).toBe('due-1');
  });

  it('can choose from the pool when the bias check fails', () => {
    const plan = createMixedPlan();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const scheduler = new SessionScheduler(plan, { reviewBias: 0.3 });
    const next = scheduler.next(new Date());
    expect(next?.id).toBe('pool-1');
  });

  it('updates score and scheduling when an answer is correct', () => {
    const plan = createPlan();
    const scheduler = new SessionScheduler(plan);
    const card = scheduler.next(new Date());
    expect(card).toBeTruthy();
    scheduler.associationRight(card!, new Date());
    expect(card?.score).toBe(3);
    expect(card?.firstTime).toBe(false);
    expect(card?.dueAt?.getTime()).toBe(new Date().getTime() + Math.pow(5, 3) * 1000);
  });

  it('resets score and schedules sooner when an answer is wrong', () => {
    const plan = createPlan();
    const scheduler = new SessionScheduler(plan);
    const card = scheduler.next(new Date());
    expect(card).toBeTruthy();
    scheduler.associationWrong(card!, new Date());
    expect(card?.score).toBe(0);
    expect(card?.firstTime).toBe(false);
    expect(card?.dueAt?.getTime()).toBe(new Date().getTime() + 1000);
  });

  it('skips cards back to the learning queue', () => {
    const plan = createPlan();
    const scheduler = new SessionScheduler(plan);
    const card = scheduler.next(new Date());
    expect(card).toBeTruthy();
    scheduler.associationSkip(card!);
    expect(card?.score).toBe(-1);
    expect(card?.firstTime).toBe(true);
    expect(card?.dueAt).toBeNull();
    const nextCard = scheduler.next(new Date());
    expect(nextCard?.id).not.toBe(card?.id);
  });
});
