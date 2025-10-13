import { AssocView } from './types';

export type RawSessionPlan = {
  due: (AssocView & { dueAt: string | null })[];
  pool: (AssocView & { dueAt: string | null })[];
  available: number;
  requested: number;
};

export type SessionCard = (AssocView & { dueAt: Date | null });

type QueueEntry = {
  card: SessionCard;
  dueDate: Date | null;
};

function parseDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

function cloneCard(raw: AssocView & { dueAt: string | null }): SessionCard {
  return {
    ...raw,
    dueAt: parseDate(raw.dueAt ?? null),
  };
}

function dueTime(entry: QueueEntry): number {
  if (!entry.dueDate) return Number.NEGATIVE_INFINITY;
  return entry.dueDate.getTime();
}

export class SessionScheduler {
  private dueQueue: QueueEntry[];

  private pool: SessionCard[];

  private seen: number;

  private readonly total: number;

  constructor(seed: RawSessionPlan) {
    const dueCards = seed.due.map(cloneCard);
    const poolCards = seed.pool.map(cloneCard);
    dueCards.sort((a, b) => {
      const aTime = a.dueAt ? a.dueAt.getTime() : -Infinity;
      const bTime = b.dueAt ? b.dueAt.getTime() : -Infinity;
      return aTime - bTime;
    });

    this.dueQueue = dueCards.map((card) => ({ card, dueDate: card.dueAt }));
    this.pool = poolCards;
    this.seen = 0;
    this.total = this.dueQueue.length + this.pool.length;
  }

  next(now: Date = new Date()): SessionCard | undefined {
    while (this.dueQueue.length) {
      const head = this.dueQueue[0];
      const dueAt = head.dueDate;
      if (!dueAt || dueAt.getTime() <= now.getTime()) {
        this.dueQueue.shift();
        this.removeFromPool(head.card.id);
        if (this.shouldSkip(head.card)) {
          this.associationSkip(head.card);
          continue;
        }
        this.seen += 1;
        return head.card;
      }
      break;
    }

    while (this.pool.length) {
      const card = this.pool.shift()!;
      if (this.shouldSkip(card)) {
        this.associationSkip(card);
        continue;
      }
      this.seen += 1;
      return card;
    }

    return undefined;
  }

  remaining(): number {
    return this.dueQueue.length + this.pool.length;
  }

  progress(): { seen: number; total: number } {
    return { seen: this.seen, total: this.total };
  }

  associationRight(card: SessionCard, now: Date = new Date()) {
    this.dropScheduled(card.id);
    this.removeFromPool(card.id);
    const previous = typeof card.score === 'number' ? card.score : -1;
    const newScore = previous + 1;
    card.score = newScore < 0 ? 0 : newScore;
    card.firstTime = false;
    const delay = Math.pow(5, Math.max(0, newScore)) * 1000;
    const dueDate = new Date(now.getTime() + delay);
    card.dueAt = dueDate;
    this.insertScheduled(card, dueDate);
  }

  associationWrong(card: SessionCard, now: Date = new Date()) {
    this.dropScheduled(card.id);
    this.removeFromPool(card.id);
    card.score = 0;
    card.firstTime = false;
    const delay = Math.pow(5, 0) * 1000;
    const dueDate = new Date(now.getTime() + delay);
    card.dueAt = dueDate;
    this.insertScheduled(card, dueDate);
  }

  associationSkip(card: SessionCard) {
    this.dropScheduled(card.id);
    this.removeFromPool(card.id);
    card.score = -1;
    card.firstTime = true;
    card.dueAt = null;
  }

  private insertScheduled(card: SessionCard, dueDate: Date | null) {
    const entry: QueueEntry = { card, dueDate };
    const targetTime = dueDate ? dueDate.getTime() : Number.NEGATIVE_INFINITY;
    let index = 0;
    for (; index < this.dueQueue.length; index += 1) {
      const existing = dueTime(this.dueQueue[index]);
      if (targetTime < existing) break;
    }
    this.dueQueue.splice(index, 0, entry);
  }

  private dropScheduled(id: string) {
    const index = this.dueQueue.findIndex((entry) => entry.card.id === id);
    if (index !== -1) {
      this.dueQueue.splice(index, 1);
    }
  }

  private removeFromPool(id: string) {
    const index = this.pool.findIndex((card) => card.id === id);
    if (index !== -1) {
      this.pool.splice(index, 1);
    }
  }

  private shouldSkip(card: SessionCard): boolean {
    return card.answer.trim() === '';
  }
}
