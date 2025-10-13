import { Direction } from './types';

export type PairLike = { question: string; answer: string };

export function associationSides(direction: Direction, pair: PairLike): { cue: string; response: string } {
  const cue = direction === 'AB' ? pair.question : pair.answer;
  const response = direction === 'AB' ? pair.answer : pair.question;
  return { cue, response };
}
