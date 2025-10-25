import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chooseAssociations, setGeniusRandomSeed } from '../engine';

type MockPair = {
  id: string;
  deckId: string;
  question: string;
  answer: string;
  importance?: number | null;
};

type MockAssociation = {
  id: string;
  pairId: string;
  direction: 'AB';
  score: number | null;
  dueAt: Date | null;
  lastShownAt: Date | null;
  resultCount: number;
  pair: MockPair;
};

const prismaMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

const findManyMock = prismaMocks.findMany;

const prismaReadyMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../prisma', () => ({
  prisma: {
    association: {
      findMany: prismaMocks.findMany,
    },
  },
  prismaReady: prismaReadyMock,
}));

function createAssociation(index: number, score: number | null, importance: number): MockAssociation {
  return {
    id: `assoc-${index}`,
    pairId: `pair-${index}`,
    direction: 'AB',
    score,
    dueAt: null,
    lastShownAt: null,
    resultCount: 0,
    pair: {
      id: `pair-${index}`,
      deckId: 'deck-1',
      question: `Question ${index}`,
      answer: `Answer ${index}`,
      importance,
    },
  };
}

function buildSampleDeck(): MockAssociation[] {
  return [
    createAssociation(0, -1, 2),
    createAssociation(1, 0, 3),
    createAssociation(2, 1, 5),
    createAssociation(3, 1, 4),
    createAssociation(4, 2, 4),
    createAssociation(5, 2, 5),
    createAssociation(6, 3, 2),
    createAssociation(7, 3, 3),
    createAssociation(8, 4, 1),
    createAssociation(9, 5, 2),
  ];
}

beforeEach(() => {
  findManyMock.mockImplementation(async () => buildSampleDeck());
  setGeniusRandomSeed(1337);
});

afterEach(() => {
  findManyMock.mockReset();
  setGeniusRandomSeed(null);
});

function extractPoolIds(plan: Awaited<ReturnType<typeof chooseAssociations>>): string[] {
  return plan.pool.map((assoc) => assoc.id);
}

describe('chooseAssociations weighting parity', () => {
  it('matches macOS Poisson weighting for balanced review vs learn (m=1)', async () => {
    const plan = await chooseAssociations({ deckId: 'deck-1', userId: 'user-1', count: 5, mValue: 1, minimumScore: -1 });
    expect(extractPoolIds(plan)).toEqual([
      'assoc-1',
      'assoc-0',
      'assoc-2',
      'assoc-3',
      'assoc-5',
    ]);
  });

  it('leans into new cards when probability center shifts toward learning (m=2)', async () => {
    setGeniusRandomSeed(4242);
    findManyMock.mockImplementation(async () => buildSampleDeck());
    const plan = await chooseAssociations({ deckId: 'deck-1', userId: 'user-1', count: 5, mValue: 2, minimumScore: -1 });
    expect(extractPoolIds(plan)).toEqual([
      'assoc-0',
      'assoc-1',
      'assoc-7',
      'assoc-2',
      'assoc-3',
    ]);
  });

  it('respects minimumScore before weighting, emphasizing higher score buckets', async () => {
    setGeniusRandomSeed(2024);
    findManyMock.mockImplementation(async () => buildSampleDeck());
    const plan = await chooseAssociations({ deckId: 'deck-1', userId: 'user-1', count: 4, mValue: 0.6, minimumScore: 0.3 });
    expect(extractPoolIds(plan)).toEqual([
      'assoc-2',
      'assoc-5',
      'assoc-3',
      'assoc-4',
    ]);
  });
});
