'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RawSessionPlan, SessionCard, SessionScheduler } from '@/lib/session';
import { computeCorrectness, defaultMatchingMode, MatchingMode, normalizeAnswerDisplay } from '@/lib/matching';

const PASS_THRESHOLD = 0.5;

type StudyParams = {
  slider: number;
  minimumScore: number;
  count: number;
  mode: MatchingMode;
};

const DEFAULT_PARAMS: StudyParams = { slider: 0, minimumScore: -1, count: 13, mode: defaultMatchingMode() };

type SessionState = {
  scheduler: SessionScheduler | null;
  current: SessionCard | null;
};

function readParams(): StudyParams {
  try {
    const raw = localStorage.getItem('studyParams');
    if (!raw) return DEFAULT_PARAMS;
    const parsed = JSON.parse(raw);
    let slider: number;
    if (typeof parsed.slider === 'number') {
      slider = parsed.slider;
    } else if (typeof parsed.m === 'number') {
      slider = (parsed.m / 2) * 100;
    } else {
      slider = DEFAULT_PARAMS.slider;
    }
    if (!Number.isFinite(slider)) slider = DEFAULT_PARAMS.slider;
    slider = Math.max(0, Math.min(100, Math.round(slider)));
    const minimumScore =
      typeof parsed.minimumScore === 'number'
        ? parsed.minimumScore
        : typeof parsed.min === 'number'
          ? parsed.min
          : DEFAULT_PARAMS.minimumScore;
    const countValue = typeof parsed.count === 'number' ? parsed.count : DEFAULT_PARAMS.count;
    return {
      slider,
      minimumScore,
      count: Number.isFinite(countValue) ? Math.max(1, Math.round(countValue)) : DEFAULT_PARAMS.count,
      mode: typeof parsed.mode === 'string' ? (parsed.mode as MatchingMode) : DEFAULT_PARAMS.mode,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

async function fetchSelection(deckId: string, params: StudyParams): Promise<RawSessionPlan> {
  const slider = Math.max(0, Math.min(100, Math.round(params.slider)));
  const m = 2 * (slider / 100);
  const minimumScore = slider >= 100 ? 0 : params.minimumScore;
  const count = Math.max(1, Math.round(params.count));
  const search = new URLSearchParams({
    deckId,
    m: String(m),
    min: String(minimumScore),
    count: String(count),
  });
  const url = `/api/select?${search.toString()}`;
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
  const [session, setSession] = useState<SessionState>({ scheduler: null, current: null });
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'review' | 'quiz' | 'check'>('quiz');
  const [autoChoice, setAutoChoice] = useState<'YES' | 'NO' | null>(null);
  const [checkScore, setCheckScore] = useState<number | null>(null);
  const [progress, setProgress] = useState({ seen: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const paramsRef = useRef<StudyParams>(DEFAULT_PARAMS);
  const inputRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  const teardownSession = useCallback(() => {
    setSession({ scheduler: null, current: null });
    setInput('');
    setAutoChoice(null);
    setCheckScore(null);
    setActionError(null);
    setError(null);
    setLoading(false);
    setPhase('quiz');
    setProgress({ seen: 0, total: 0 });
    inputRef.current?.blur();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    teardownSession();
  }, [teardownSession]);

  const takeNextCard = useCallback((scheduler: SessionScheduler | null) => {
    if (!scheduler) {
      teardownSession();
      return;
    }
    const next = scheduler.next();
    const prog = scheduler.progress();
    setProgress(prog);
    setSession({ scheduler, current: next ?? null });
    setActionError(null);
    if (next) {
      const isReview = Boolean(next.firstTime);
      setPhase(isReview ? 'review' : 'quiz');
      setInput(isReview ? next.answer : '');
      setAutoChoice(null);
      setCheckScore(null);
      setTimeout(() => {
        if (isReview) {
          inputRef.current?.focus();
          inputRef.current?.select();
        } else {
          inputRef.current?.focus();
        }
      }, 0);
    } else {
      setPhase('quiz');
      setInput('');
      setAutoChoice(null);
      setCheckScore(null);
      setTimeout(() => close(), 0);
    }
  }, [close, teardownSession]);

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
    const params = readParams();
    paramsRef.current = params;
    fetchSelection(deckId, params)
      .then((plan) => {
        if (!active) return;
        const scheduler = new SessionScheduler(plan);
        setSession({ scheduler, current: null });
        setProgress(scheduler.progress());
        takeNextCard(scheduler);
      })
      .catch(() => {
        if (!active) return;
        setSession({ scheduler: null, current: null });
        setError('Could not load cards.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, deckId, takeNextCard]);

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

  useEffect(() => {
    if (phase !== 'check') return;
    if (autoChoice === 'YES') {
      yesRef.current?.focus();
    } else if (autoChoice === 'NO') {
      noRef.current?.focus();
    }
  }, [phase, autoChoice]);

  const scheduler = session.scheduler;
  const current = session.current;

  const refreshProgress = () => {
    if (!scheduler) {
      setProgress({ seen: 0, total: 0 });
      return;
    }
    setProgress(scheduler.progress());
  };

  const next = () => {
    takeNextCard(scheduler);
    refreshProgress();
  };

  const applyRight = async () => {
    if (!current || !scheduler || submitting) return;
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      const mark = current.firstTime ? 'WRONG' : 'RIGHT';
      const res = await fetch('/api/mark', {
        method: 'POST',
        body: JSON.stringify({ associationId: current.id, decision: mark }),
      });
      if (!res.ok) throw new Error('mark failed');
      if (current.firstTime) {
        scheduler.associationWrong(current);
      } else {
        scheduler.associationRight(current);
      }
      broadcastScore(current.pairId, current.score);
      next();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyWrong = async () => {
    if (!current || !scheduler || submitting) return;
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'WRONG' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationWrong(current);
      broadcastScore(current.pairId, 0);
      next();
    } catch (err) {
      console.error(err);
      setActionError('Could not update this card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const applySkip = async () => {
    if (!current || !scheduler || submitting) return;
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', { method: 'POST', body: JSON.stringify({ associationId: current.id, decision: 'SKIP' }) });
      if (!res.ok) throw new Error('mark failed');
      scheduler.associationSkip(current);
      broadcastScore(current.pairId, -1);
      next();
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
      await applyRight();
      return;
    }
    setSubmitting(true);
    try {
      const { mode } = paramsRef.current;
      const score = await computeCorrectness(current.answer, input, mode);
      if (score >= 0.999) {
        setSubmitting(false);
        await applyRight();
        return;
      }
      inputRef.current?.blur();
      setCheckScore(score);
      setAutoChoice(score >= PASS_THRESHOLD ? 'YES' : 'NO');
      setPhase('check');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReveal = () => {
    if (!current) return;
    inputRef.current?.blur();
    setAutoChoice(null);
    setCheckScore(null);
    setPhase('check');
  };

  if (!open) return null;

  const isIntro = Boolean(current?.firstTime);
  const scoreDisplay = current ? formatScore(current.score) : '—';
  const metaLabel = isIntro ? 'new word' : `score ${scoreDisplay}`;
  const progressPercent = progress.total === 0 ? 0 : Math.min(1, progress.seen / progress.total);

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
          {loading ? (
            <div className="study-empty">Preparing your session…</div>
          ) : error ? (
            <div className="study-empty" role="alert">{error}</div>
          ) : !current ? (
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
              <p className="study-intro__note">Study the answer, type it once, then mark yourself ready. The card will reappear soon for recall.</p>
              <div className="study-intro__input">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void applyRight();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setInput(current.answer);
                    }
                  }}
                  placeholder="Type it to lock it in…"
                  disabled={submitting}
                />
              </div>
              <div className="study-intro__footer">Progress {Math.round(progressPercent * 100)}%</div>
              <div className="review-row review-row--intro">
                <span>Ready to start recall?</span>
                <div className="spacer" />
                <button
                  ref={yesRef}
                  onClick={applyRight}
                  className="btn yes btn--default"
                  type="button"
                  disabled={submitting}
                >
                  Right
                </button>
                <button onClick={applySkip} className="btn" type="button" disabled={submitting}>Skip</button>
              </div>
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
                  disabled={submitting}
                />
                <div className="btn-row">
                  <button onClick={handleReveal} className="btn" type="button">Reveal</button>
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
                  ref={yesRef}
                  onClick={applyRight}
                  className={`btn yes${autoChoice === 'YES' ? ' btn--default' : ''}`}
                  type="button"
                  disabled={submitting}
                >
                  Yes
                </button>
                <button
                  ref={noRef}
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
