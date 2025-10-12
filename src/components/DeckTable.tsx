
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

export default function DeckTable({ deckId, rows }: { deckId: string; rows: Row[] }){
  const [query, setQuery] = useState('');
  useEffect(()=>{
    const onSearch = (e: Event) => {
      const ce = e as CustomEvent<string>;
      setQuery(ce.detail || '');
    };
    window.addEventListener('deck-search', onSearch as EventListener);
    return ()=>window.removeEventListener('deck-search', onSearch as EventListener);
  }, []);

  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.question.toLowerCase().includes(q) || r.answer.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="boxed">
      <div className="header">
        <div className="th chk" />
        <div className="th qcol">Question</div>
        <div className="th acol">Answer</div>
        <div className="th scol">Score(+-)</div>
      </div>
      {filtered.map((r)=> (
        <form key={r.pairId} className="row grid-4" action={saveRow}>
          <input type="hidden" name="deckId" value={deckId} />
          <input type="hidden" name="pairId" value={r.pairId} />
          <input type="hidden" name="associationId" value={r.associationId ?? ''} />
          <div className="td chk"><input type="checkbox" defaultChecked /></div>
          <div className="td qcol"><input name="question" type="text" defaultValue={r.question} /></div>
          <div className="td acol"><input name="answer" type="text" defaultValue={r.answer} /></div>
          <div className="td scol">
            <div className="score-inline">
              <input name="score" type="number" min="-1" max="10" defaultValue={r.score} />
              <button className="chip" type="submit">Save</button>
              <button className="chip" type="submit" formAction={deletePair}>Delete</button>
            </div>
          </div>
        </form>
      ))}
      <div className="footer"><div className="spacer" /></div>
    </div>
  );
}
