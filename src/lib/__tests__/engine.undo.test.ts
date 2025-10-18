import { describe, expect, it, vi } from 'vitest';

import { restoreAssociation } from '../engine';

const prismaMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    association: {
      update: prismaMocks.update,
    },
  },
}));

describe('restoreAssociation', () => {
  it('writes provided snapshot fields back to the database', async () => {
    prismaMocks.update.mockResolvedValue({ pair: { deckId: 'deck-1' } });
    const deckId = await restoreAssociation('assoc-1', {
      score: 3,
      dueAt: '2024-01-02T00:00:00.000Z',
      firstTime: false,
    });
    expect(prismaMocks.update).toHaveBeenCalledWith({
      where: { id: 'assoc-1' },
      data: {
        score: 3,
        dueAt: new Date('2024-01-02T00:00:00.000Z'),
        firstTime: false,
      },
      include: { pair: { select: { deckId: true } } },
    });
    expect(deckId).toBe('deck-1');
  });

  it('handles null scores and due dates', async () => {
    prismaMocks.update.mockResolvedValue({ pair: { deckId: 'deck-2' } });
    const deckId = await restoreAssociation('assoc-2', {
      score: null,
      dueAt: null,
      firstTime: true,
    });
    expect(prismaMocks.update).toHaveBeenLastCalledWith({
      where: { id: 'assoc-2' },
      data: {
        score: null,
        dueAt: null,
        firstTime: true,
      },
      include: { pair: { select: { deckId: true } } },
    });
    expect(deckId).toBe('deck-2');
  });
});
