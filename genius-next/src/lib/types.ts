
export type ID = string;
export type Direction = 'AB'|'BA';

export interface AssocView {
  id: ID;
  pairId: ID;
  direction: Direction;
  question: string;
  answer: string;
  score: number;
  dueAt: Date | null;
  firstTime: boolean;
}
