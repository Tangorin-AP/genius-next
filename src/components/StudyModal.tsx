
'use client';

import { useEffect, useRef, useState } from 'react';

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

function readParams(){
  try {
    const raw = localStorage.getItem('studyParams');
    if (!raw) return { m: 0, min: -1, count: 30, mode: 'exact' as 'exact'|'similar'|'words' };
    const parsed = JSON.parse(raw);
    return { m: parsed.m ?? 0, min: parsed.min ?? -1, count: parsed.count ?? 30, mode: (parsed.mode ?? 'exact') as 'exact'|'similar'|'words' };
  } catch { return { m: 0, min: -1, count: 30, mode: 'exact' as const }; }
}

async function fetchSelection(deckId: string, params: {m:number;min:number;count:number}): Promise<Assoc[]> {
  const url = `/api/select?deckId=${deckId}&m=${params.m}&min=${params.min}&count=${params.count}`;
  const res = await fetch(url, { cache: 'no-store' });
  return res.json();
}

export default function StudyModal({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Assoc[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const paramsRef = useRef<{m:number;min:number;count:number;mode:'exact'|'similar'|'words'}>({m:0,min:-1,count:30,mode:'exact'});

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
    const params = readParams();
    paramsRef.current = params;
    fetchSelection(deckId, params).then(res => { setItems(res); setIdx(0); setInput(''); setRevealed(false); setTimeout(()=>inputRef.current?.focus(), 0)});
  }, [open, deckId]);

  if (!open) return null;

  const current = items[idx];
  const onClose = ()=> setOpen(false);

  const doReveal = () => setRevealed(true);

  const doSubmit = async () => {
    if (!current) return;
    const mode = paramsRef.current.mode;
    if (isMatch(current.answer, input, mode)) {
      await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'RIGHT' }) });
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
  const yes = async () => { await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current?.id, decision: 'RIGHT' }) }); next(); };
  const no  = async () => { await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current?.id, decision: 'WRONG' }) }); next(); };
  const skip = async () => { await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current?.id, decision: 'SKIP' }) }); next(); };

  return (
    <div className="screen">
      <div className="modal boxed">
        <div className="modal-header">
          <div className="title">Study</div>
          <div className="spacer" />
          <button className="icon" onClick={onClose}>×</button>
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

function normalize(s:string){ return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }
function isMatch(expected:string, user:string, mode:'exact'|'similar'|'words'){
  if (normalize(expected) === normalize(user)) return true;
  if (mode === 'words'){
    const A = new Set(normalize(expected).split(' '));
    const B = new Set(normalize(user).split(' '));
    if (A.size === B.size && [...A].every(x=>B.has(x))) return true;
  }
  return false;
}
