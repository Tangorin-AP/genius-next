
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

function broadcastScore(pairId: string, score: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('deck-score', { detail: { pairId, score } }));
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open) {
      document.body.dataset.studyOpen = 'true';
    } else {
      delete document.body.dataset.studyOpen;
    }
    return () => {
      delete document.body.dataset.studyOpen;
    };
  }, [open]);

  if (!open) return null;

  const current = items[idx];
  const isIntro = Boolean(current?.firstTime);
  const scoreDisplay = current ? (current.score < 0 ? '—' : current.score) : '—';
  const metaLabel = isIntro ? 'new word' : `score ${scoreDisplay}`;
  const onClose = ()=> setOpen(false);

  const doReveal = () => setRevealed(true);

  const confirmIntro = async () => {
    if (!current) return;
    await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'SKIP' }) });
    broadcastScore(current.pairId, Math.max(0, current.score));
    setItems((prev) => {
      const clone = [...prev];
      if (clone[idx]) {
        clone[idx] = { ...clone[idx], firstTime: false, score: Math.max(0, clone[idx].score) };
      }
      return clone;
    });
    next();
  };

  const doSubmit = async () => {
    if (!current) return;
    if (current.firstTime) {
      await confirmIntro();
      return;
    }
    const mode = paramsRef.current.mode;
    if (isMatch(current.answer, input, mode)) {
      await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'RIGHT' }) });
      const newScore = Math.max(0, current.score) + 1;
      broadcastScore(current.pairId, newScore);
      setItems((prev) => {
        const clone = [...prev];
        if (clone[idx]) clone[idx] = { ...clone[idx], score: newScore };
        return clone;
      });
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
  const yes = async () => {
    if (!current || current.firstTime) return;
    await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'RIGHT' }) });
    const newScore = Math.max(0, current.score) + 1;
    broadcastScore(current.pairId, newScore);
    setItems((prev) => {
      const clone = [...prev];
      if (clone[idx]) clone[idx] = { ...clone[idx], score: newScore };
      return clone;
    });
    next();
  };
  const no  = async () => {
    if (!current || current.firstTime) return;
    await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'WRONG' }) });
    broadcastScore(current.pairId, 0);
    setItems((prev) => {
      const clone = [...prev];
      if (clone[idx]) clone[idx] = { ...clone[idx], score: 0 };
      return clone;
    });
    next();
  };
  const skip = async () => {
    if (!current) return;
    if (current.firstTime) {
      await confirmIntro();
      return;
    }
    await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'SKIP' }) });
    broadcastScore(current.pairId, Math.max(0, current.score));
    next();
  };

  return (
    <div className="screen screen--study">
      <div className="modal boxed modal--study">
        <div className="modal-header">
          <div className="title">Study</div>
          <div className="spacer" />
          <button className="icon" onClick={onClose}>×</button>
        </div>
        <div className={`modal-body${isIntro ? ' modal-body--intro' : ''}`}>
          {!current ? (
            <div className="study-empty">You're all caught up for now. Try broadening the study settings to review more cards.</div>
          ) : isIntro ? (
            <div className="study-intro">
              <div className="study-intro__question">{current.question}</div>
              <div className="study-intro__meta">
                <span>{current.direction ?? 'AB'}</span>
                <span aria-hidden="true">•</span>
                <span>{metaLabel}</span>
              </div>
              <div className="study-intro__answer">{current.answer}</div>
              <p className="study-intro__note">Remember this item, then type it below before you go.</p>
              <div className="study-intro__input">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void confirmIntro();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setInput('');
                    }
                  }}
                  placeholder="Type it to lock it in…"
                />
                <button onClick={confirmIntro} className="btn primary" type="button">Go</button>
              </div>
              <div className="study-intro__footer">Press Enter or Go when you're ready.</div>
            </div>
          ) : (
            <>
              <div className="cue">{current.question}</div>
              <div className="meta meta--study">
                <span>{current.direction ?? 'AB'}</span>
                <span aria-hidden="true">•</span>
                <span>{metaLabel}</span>
              </div>
              <div className="answer-block">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (revealed) {
                        yes();
                      } else {
                        doSubmit();
                      }
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setInput('');
                      setRevealed(false);
                    }
                  }}
                  placeholder="Type your answer…"
                />
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
                    <button onClick={no} className="btn no" type="button">No</button>
                    <button onClick={skip} className="btn" type="button">Skip</button>
                  </div>
                </div>
              )}
            </>
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
