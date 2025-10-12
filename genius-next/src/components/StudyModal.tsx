
'use client';

import { useEffect, useRef, useState } from 'react';
import { isExactLike, trigramCosine } from '@/lib/similarity';

type Assoc = {
  id: string;
  pairId: string;
  direction: 'AB'|'BA';
  question: string;
  answer: string;
  score: number;
  dueAt: string | null;
  firstTime: boolean;
};

async function fetchSelection(deckId: string): Promise<Assoc[]> {
  const res = await fetch(`/api/select?deckId=${deckId}`, { cache: 'no-store' });
  return res.json();
}
async function mark(associationId: string, decision: 'RIGHT'|'WRONG'|'SKIP') {
  await fetch(`/api/mark`, { method: 'POST', body: JSON.stringify({ associationId, decision }) });
}

export default function StudyModal({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Assoc[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const onSubmitFromToolbar = (e: Event) => {
      const target = e.target as HTMLFormElement;
      if (target && target.id === 'studyForm') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('submit', onSubmitFromToolbar);
    return () => document.removeEventListener('submit', onSubmitFromToolbar);
  }, []);

  useEffect(()=>{
    if (!open) return;
    fetchSelection(deckId).then(res => { setItems(res); setIdx(0); setInput(''); setRevealed(false); setTimeout(()=>inputRef.current?.focus(), 0)});
  }, [open, deckId]);

  if (!open) return null;

  const current = items[idx];
  const onClose = ()=> setOpen(false);

  const doReveal = () => {
    setRevealed(true);
  };
  const doSubmit = async () => {
    if (!current) return;
    // exact accept (case/punct/space-insensitive); else ask yes/no
    if (isExactLike(current.answer, input)) {
      await mark(current.id, 'RIGHT');
      next();
      return;
    }
    setRevealed(true);
  };
  const next = () => {
    setInput('');
    setRevealed(false);
    if (idx + 1 < items.length) {
      setIdx(i=>i+1);
      setTimeout(()=>inputRef.current?.focus(), 0);
    } else {
      setOpen(false);
    }
  }
  const yes = async () => { await mark(current.id, 'RIGHT'); next(); };
  const no  = async () => { await mark(current.id, 'WRONG'); next(); };
  const skip = async () => { await mark(current.id, 'SKIP'); next(); };

  return (
    <div className="screen">
      <div className="modal boxed">
        <div className="modal-header">
          <div className="title">Study</div>
          <div className="spacer" />
          <button className="icon" onClick={()=>setOpen(false)}>×</button>
        </div>
        <div className="modal-body">
          <div className="cue">{current?.question ?? '—'}</div>
          <div className="meta"><span>AB</span> • <span>score {current ? (current.score < 0 ? '—' : current.score) : '—'}</span></div>
          <div className="answer-block">
            <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} placeholder="Type your answer…" />
            <div className="btn-row">
              <button onClick={doReveal} className="btn" type="button">Reveal</button>
              <button onClick={doSubmit} className="btn primary" type="button">Submit</button>
            </div>
          </div>
          {revealed && current && (
            <div className="revealed">
              <div className="diff">
                You typed: {input || '—'}{"\n"}
                Expected: {current.answer}
              </div>
              <div className="answer-line">Answer: <span>{current.answer}</span></div>
              <div className="review-row">
                <span>Were you correct?</span>
                <div className="spacer" />
                <button onClick={yes} className="btn yes" type="button">Yes</button>
                <button onClick={no} className="btn no primary" type="button">No</button>
                <button onClick={skip} className="btn" type="button">Skip</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
