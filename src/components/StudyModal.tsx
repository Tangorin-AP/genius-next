'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RawSessionPlan, SessionCard, SessionScheduler } from '@/lib/session';
import { computeCorrectness, defaultMatchingMode, MatchingMode, normalizeAnswerDisplay } from '@/lib/matching';

const PASS_THRESHOLD = 0.5;

type Phase = 'idle' | 'welcome' | 'review' | 'quiz' | 'check' | 'empty';

type StudyParams = {
  m: number;
  min: number;
  count: number;
  mode: MatchingMode;
};

const DEFAULT_PARAMS: StudyParams = { m: 0, min: -1, count: 30, mode: defaultMatchingMode() };

function readParams(): StudyParams {
  try {
    const raw = localStorage.getItem('studyParams');
    if (!raw) return DEFAULT_PARAMS;
    const parsed = JSON.parse(raw);
    return {
      m: typeof parsed.m === 'number' ? parsed.m : DEFAULT_PARAMS.m,
      min: typeof parsed.min === 'number' ? parsed.min : DEFAULT_PARAMS.min,
      count: typeof parsed.count === 'number' ? parsed.count : DEFAULT_PARAMS.count,
      mode: typeof parsed.mode === 'string' ? (parsed.mode as MatchingMode) : DEFAULT_PARAMS.mode,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

async function fetchSelection(deckId: string, params: StudyParams): Promise<RawSessionPlan> {
  const url = `/api/select?deckId=${deckId}&m=${params.m}&min=${params.min}&count=${params.count}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('selection failed');
  return res.json();
}

function broadcastScore(pairId: string, score: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('deck-score', { detail: { pairId, score } }));
}

function formatScore(score: number): string {
  if (score < 0) return '—';
  return String(score);
}

export default function StudyModal({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const [scheduler, setScheduler] = useState<SessionScheduler | null>(null);
  const [current, setCurrent] = useState<SessionCard | null>(null);
  const [input, setInput] = useState('');
  const [autoChoice, setAutoChoice] = useState<'YES' | 'NO' | null>(null);
  const [checkScore, setCheckScore] = useState<number | null>(null);
  const [progress, setProgress] = useState({ seen: 0, total: 0 });
  const [phase, setPhase] = useState<Phase>('idle');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const paramsRef = useRef<StudyParams>(DEFAULT_PARAMS);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputLocked, setInputLocked] = useState(false);

  const resetForNextCard = useCallback(
    (card: SessionCard | null, activeScheduler: SessionScheduler | null) => {
      if (!activeScheduler) {
        setProgress({ seen: 0, total: 0 });
      } else {
        setProgress(activeScheduler.progress());
      }
      setCurrent(card);
      setActionError(null);
      setAutoChoice(null);
      setCheckScore(null);
      setInputLocked(false);

      if (!card) {
        setInput('');
        setPhase('empty');
        return;
      }

      if (card.firstTime) {
        setInput(card.answer);
        setPhase('review');
      } else {
        setInput('');
        setPhase('quiz');
      }

      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [],
  );

  const runQuizOnce = useCallback(() => {
    if (!scheduler) {
      resetForNextCard(null, null);
      return;
    }
    const nextCard = scheduler.next();
    resetForNextCard(nextCard ?? null, scheduler);
  }, [resetForNextCard, scheduler]);

  const runQuiz = useCallback(
    (newScheduler: SessionScheduler) => {
      setScheduler(newScheduler);
      const snapshot = newScheduler.progress();
      setProgress(snapshot);
      if (snapshot.total === 0) {
        resetForNextCard(null, newScheduler);
      } else {
        setCurrent(null);
        setPhase('welcome');
      }
    },
    [resetForNextCard],
  );

  useEffect(() => {
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

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setScheduler(null);
    setCurrent(null);
    setPhase('idle');
    setInput('');
    setAutoChoice(null);
    setCheckScore(null);
    setActionError(null);
    setInputLocked(false);
    setProgress({ seen: 0, total: 0 });
    const params = readParams();
    paramsRef.current = params;
    fetchSelection(deckId, params)
      .then((plan) => {
        if (!active) return;
        runQuiz(new SessionScheduler(plan));
      })
      .catch(() => {
        if (!active) return;
        setScheduler(null);
        setCurrent(null);
        setError('Could not load cards.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, deckId, runQuiz]);

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

  const close = () => {
    setOpen(false);
    setScheduler(null);
    setCurrent(null);
    setPhase('idle');
  };

  const progressPercent = useMemo(() => {
    if (progress.total === 0) return 0;
    return Math.min(1, progress.seen / progress.total);
  }, [progress]);

  const startSession = () => {
    if (!scheduler) return;
    runQuizOnce();
  };

  const confirmIntro = async () => {
    if (!current || !scheduler || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'WRONG' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationWrong(current);
      broadcastScore(current.pairId, 0);
      runQuizOnce();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyRight = async () => {
    if (!current || !scheduler || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'RIGHT' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationRight(current);
      broadcastScore(current.pairId, current.score);
      runQuizOnce();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyWrong = async () => {
    if (!current || !scheduler || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'WRONG' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationWrong(current);
      broadcastScore(current.pairId, 0);
      runQuizOnce();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const applySkip = async () => {
    if (!current || !scheduler || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'SKIP' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationSkip(current);
      broadcastScore(current.pairId, -1);
      runQuizOnce();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const doSubmit = async () => {
    if (!current || !scheduler || submitting) return;
    if (current.firstTime) {
      await confirmIntro();
      return;
    }
    setInputLocked(true);
    setSubmitting(true);
    let movedToCheck = false;
    try {
      const { mode } = paramsRef.current;
      const score = await computeCorrectness(current.answer, input, mode);
      if (score >= 0.999) {
        await applyRight();
        return;
      }
      setCheckScore(score);
      setAutoChoice(score >= PASS_THRESHOLD ? 'YES' : 'NO');
      setPhase('check');
      movedToCheck = true;
    } finally {
      setSubmitting(false);
      if (!movedToCheck) {
        setInputLocked(false);
      }
    }
  };

  if (!open) return null;

  const scoreDisplay = current ? formatScore(current.score) : '—';
  const isIntro = phase === 'review';
  const metaLabel = isIntro ? 'new word' : `score ${scoreDisplay}`;

  return (
    <div className="screen screen--study">
      <div className="modal boxed modal--study">
        <div className="modal-header">
          <div className="title">Study</div>
          <div className="spacer" />
          <button className="icon" onClick={close}>×</button>
        </div>
        <div className={`modal-body${isIntro ? ' modal-body--intro' : ''}`}>
          {actionError && !loading && !error && (
            <div className="study-error" role="status">{actionError}</div>
          )}
          <div className="study-progress">
            <div className="study-progress__bar" aria-hidden="true">
              <div className="study-progress__fill" style={{ width: `${Math.round(progressPercent * 100)}%` }} />
            </div>
            <div className="study-progress__label">Progress {Math.round(progressPercent * 100)}%</div>
          </div>
          {loading ? (
            <div className="study-empty">Preparing your session…</div>
          ) : error ? (
            <div className="study-empty" role="alert">{error}</div>
          ) : phase === 'welcome' ? (
            <div className="study-welcome">
              <h2>Take a moment…</h2>
              <p>Find your focus, breathe, and get ready to review what you&apos;ve learned. When you&apos;re ready, start the session and stay in the flow until you&apos;re done.</p>
              <button className="btn primary" type="button" onClick={startSession}>Begin session</button>
            </div>
          ) : phase === 'empty' ? (
            <div className="study-empty">You're all caught up for now. Try broadening the study settings to review more cards.</div>
          ) : phase === 'review' && current ? (
            <div className="study-intro">
              <div className="study-intro__question">{current.question}</div>
              <div className="study-intro__meta">
                <span>{current.direction ?? 'AB'}</span>
                <span aria-hidden="true">•</span>
                <span>{metaLabel}</span>
              </div>
              <div className="study-intro__answer">{current.answer}</div>
              <p className="study-intro__note">Read it once, then type it below. Confirming will drop it straight into recall mode.</p>
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
                      setInput(current.answer);
                    }
                  }}
                  placeholder="Type it to lock it in…"
                  disabled={submitting || inputLocked}
                />
                <button onClick={confirmIntro} className="btn primary" type="button" disabled={submitting}>Start recall</button>
              </div>
              <div className="study-intro__footer">{progress.seen} / {progress.total}</div>
            </div>
          ) : phase === 'quiz' && current ? (
            <>
              <div className="cue">{current.question}</div>
              <div className="meta meta--study">
                <span>{current.direction ?? 'AB'}</span>
                <span aria-hidden="true">•</span>
                <span>{metaLabel}</span>
                <span aria-hidden="true">•</span>
                <span>{progress.seen} / {progress.total}</span>
              </div>
              <div className="answer-block">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void doSubmit();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setInput('');
                      setAutoChoice(null);
                      setCheckScore(null);
                    }
                  }}
                  placeholder="Type your answer…"
                  disabled={submitting || inputLocked}
                />
                <div className="btn-row">
                  <button onClick={doSubmit} className="btn primary" type="button" disabled={submitting}>Submit</button>
                </div>
              </div>
            </>
          ) : phase === 'check' && current ? (
            <div className="revealed">
              <div className="cue">{current.question}</div>
              <div className="meta meta--study">
                <span>{current.direction ?? 'AB'}</span>
                <span aria-hidden="true">•</span>
                <span>{metaLabel}</span>
                <span aria-hidden="true">•</span>
                <span>{progress.seen} / {progress.total}</span>
              </div>
              <div className="diff">
                <div>Similarity score: {checkScore !== null ? checkScore.toFixed(2) : '—'}</div>
                <div>You typed: {normalizeAnswerDisplay(input)}</div>
                <div>Expected: {normalizeAnswerDisplay(current.answer)}</div>
              </div>
              <div className="answer-line">Answer: <span>{current.answer}</span></div>
              <div className="review-row">
                <span>Were you correct?</span>
                <div className="spacer" />
                <button
                  onClick={applyRight}
                  className={`btn yes${autoChoice === 'YES' ? ' btn--default' : ''}`}
                  type="button"
                  disabled={submitting}
                >
                  Yes
                </button>
                <button
                  onClick={applyWrong}
                  className={`btn no${autoChoice === 'NO' ? ' btn--default' : ''}`}
                  type="button"
                  disabled={submitting}
                >
                  No
                </button>
                <button onClick={applySkip} className="btn" type="button" disabled={submitting}>Skip</button>
              </div>
            </div>
          ) : (
            <div className="study-empty">You're all caught up for now. Try broadening the study settings to review more cards.</div>
          )}
        </div>
      </div>
    </div>
  );
}
