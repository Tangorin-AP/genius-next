
export type ID = string;
export type Direction = 'AB'|'BA';

export interface AssocView {
  id: ID;
  pairId: ID;
  direction: Direction;
  cue: string;
  response: string;
  /** @deprecated Use cue instead. */
  question: string;
  /** @deprecated Use response instead. */
  answer: string;
  score: number;
  dueAt: Date | null;
  firstTime: boolean;
}
