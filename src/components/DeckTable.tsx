'use client';

import { useEffect, useMemo, useState } from 'react';
import { saveRow, deletePair } from '@/app/deck/[deckId]/actions';

type Row = {
  pairId: string;
  question: string;
  answer: string;
  associationId: string | null;
  score: number;
};

export default function DeckTable({ deckId, rows }: { deckId: string; rows: Row[] }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onSearch = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setQuery(customEvent.detail || '');
    };

    window.addEventListener('deck-search', onSearch as EventListener);
    return () => window.removeEventListener('deck-search', onSearch as EventListener);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.question.toLowerCase().includes(q) ||
        row.answer.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="boxed table-scroll">
      <div className="table-grid">
        <div className="header">
          <div className="th chk" />
          <div className="th qcol">Question</div>
          <div className="th acol">Answer</div>
          <div className="th scol">Score (+/-)</div>
        </div>
        {filtered.map((row) => (
          <form key={row.pairId} className="row grid-4" action={saveRow}>
            <input type="hidden" name="deckId" value={deckId} />
            <input type="hidden" name="pairId" value={row.pairId} />
            <input type="hidden" name="associationId" value={row.associationId ?? ''} />
            <div className="td chk">
              <input type="checkbox" defaultChecked />
            </div>
            <div className="td qcol" data-label="Question">
              <input name="question" type="text" defaultValue={row.question} />
            </div>
            <div className="td acol" data-label="Answer">
              <input name="answer" type="text" defaultValue={row.answer} />
            </div>
            <div className="td scol" data-label="Score (+/-)">
              <div className="score-inline">
                <input name="score" type="number" min="-1" max="10" defaultValue={row.score} />
                <button className="chip" type="submit">Save</button>
                <button className="chip" type="submit" formAction={deletePair}>
                  Delete
                </button>
              </div>
            </div>
          </form>
        ))}
        <div className="footer">
          <div className="spacer" />
        </div>
      </div>
    </div>
  );
}
