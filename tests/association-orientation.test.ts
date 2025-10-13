import { test } from 'node:test';
import assert from 'node:assert/strict';

import { associationSides } from '../src/lib/association';
import { SessionScheduler } from '../src/lib/session';
import type { RawSessionPlan } from '../src/lib/session';

test('associationSides returns front cue for AB direction', () => {
  const pair = { question: 'front', answer: 'back' };
  const { cue, response } = associationSides('AB', pair);
  assert.equal(cue, 'front');
  assert.equal(response, 'back');
});

test('associationSides returns flipped cue for BA direction', () => {
  const pair = { question: 'front', answer: 'back' };
  const { cue, response } = associationSides('BA', pair);
  assert.equal(cue, 'back');
  assert.equal(response, 'front');
});

test('SessionScheduler preserves cue/response fields through scheduling', () => {
  const plan: RawSessionPlan = {
    due: [],
    pool: [
      {
        id: 'assoc-1',
        pairId: 'pair-1',
        direction: 'AB',
        cue: 'front',
        response: 'back',
        question: 'front',
        answer: 'back',
        score: -1,
        dueAt: null,
        firstTime: true,
      },
    ],
    available: 1,
    requested: 1,
  };

  const scheduler = new SessionScheduler(plan);
  const card = scheduler.next(new Date(0));
  assert(card, 'expected a card');
  assert.equal(card?.cue, 'front');
  assert.equal(card?.response, 'back');

  scheduler.associationWrong(card!, new Date(0));
  assert.equal(card?.cue, 'front');
  assert.equal(card?.response, 'back');
});
