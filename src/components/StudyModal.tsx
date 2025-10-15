'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RawSessionPlan, SessionCard, SessionScheduler } from '@/lib/session';
import { computeCorrectness, defaultMatchingMode, MatchingMode, normalizeAnswerDisplay } from '@/lib/matching';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';

const PASS_THRESHOLD = 0.5;

type StudyParams = {
  slider: number;
  minimumScore: number;
  baseMinimumScore: number;
  mode: MatchingMode;
};

const DEFAULT_PARAMS: StudyParams = {
  slider: 0,
  minimumScore: -1,
  baseMinimumScore: -1,
  mode: defaultMatchingMode(),
};

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
    const explicitMinimum =
      typeof parsed.minimumScore === 'number'
        ? parsed.minimumScore
        : typeof parsed.min === 'number'
          ? parsed.min
          : null;
    const baseMinimumScore =
      typeof parsed.baseMinimumScore === 'number'
        ? parsed.baseMinimumScore
        : explicitMinimum !== null && slider < 100
          ? explicitMinimum
          : DEFAULT_PARAMS.baseMinimumScore;
    const minimumScore =
      slider >= 100
        ? Math.max(0, explicitMinimum ?? baseMinimumScore)
        : baseMinimumScore;
    return {
      slider,
      minimumScore,
      baseMinimumScore,
      mode: typeof parsed.mode === 'string' ? (parsed.mode as MatchingMode) : DEFAULT_PARAMS.mode,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

async function fetchSelection(deckId: string, params: StudyParams): Promise<RawSessionPlan> {
  const slider = Math.max(0, Math.min(100, Math.round(params.slider)));
  const m = 2 * (slider / 100);
  const baseMinimumScore = Number.isFinite(params.baseMinimumScore)
    ? params.baseMinimumScore
    : DEFAULT_PARAMS.baseMinimumScore;
  const minimumScore = slider >= 100 ? Math.max(0, baseMinimumScore) : baseMinimumScore;
  const count = UNSCHEDULED_SAMPLE_COUNT;
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
  const okRef = useRef<HTMLButtonElement>(null);

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

  if (!open) return null;

  const isIntro = Boolean(current?.firstTime);
  const scoreDisplay = current ? formatScore(current.score) : '—';
  const metaLabel = isIntro ? 'New item' : `Score ${scoreDisplay}`;
  const progressPercent = progress.total === 0 ? 0 : Math.min(1, progress.seen / progress.total);
  const showAnswer = Boolean(current && (phase === 'review' || phase === 'check'));
  const answerDisplay = showAnswer ? current?.answer ?? '' : '';
  const disableEntry = submitting || phase === 'check';
  const typedLabel = normalizeAnswerDisplay(input);
  const expectedLabel = current ? normalizeAnswerDisplay(current.answer) : '';

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
          ) : (
            <div className="quiz-layout">
              <div className="quiz-meta">
                <div className="quiz-meta__primary">
                  <span className="quiz-chip">{current.direction ?? 'AB'}</span>
                  <span aria-hidden="true" className="quiz-meta__dot">•</span>
                  <span className="quiz-meta__label">{metaLabel}</span>
                </div>
                <div className="quiz-meta__progress">{progress.seen} / {progress.total}</div>
              </div>
              <div className="quiz-progress">
                <div className="quiz-progress__track">
                  <div className="quiz-progress__fill" style={{ width: `${Math.round(progressPercent * 100)}%` }} />
                </div>
              </div>
              <div className="quiz-panels">
                <div className="quiz-panel">
                  <div className="quiz-panel__label">Question</div>
                  <div className="quiz-panel__content">{current.question}</div>
                </div>
                <div className={`quiz-panel quiz-panel--answer${showAnswer ? ' quiz-panel--answer-visible' : ''}`}>
                  <div className="quiz-panel__label">Answer</div>
                  <div className="quiz-panel__content">{answerDisplay || <>&nbsp;</>}</div>
                </div>
              </div>
              <div className="quiz-entry">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (phase === 'review') {
                        void applyRight();
                      } else {
                        void doSubmit();
                      }
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      if (phase === 'review') {
                        setInput(current.answer);
                      } else if (phase === 'quiz') {
                        setInput('');
                        setAutoChoice(null);
                        setCheckScore(null);
                      }
                    }
                  }}
                  placeholder={phase === 'review' ? 'Type it once to remember…' : 'Type your answer and press Return'}
                  disabled={disableEntry}
                />
              </div>
              {phase === 'check' && (
                <div className="quiz-diff">
                  <div className="quiz-diff__row">
                    <span>You typed</span>
                    <span>{typedLabel}</span>
                  </div>
                  <div className="quiz-diff__row">
                    <span>Expected</span>
                    <span>{expectedLabel}</span>
                  </div>
                  <div className="quiz-diff__row">
                    <span>Similarity</span>
                    <span>{checkScore !== null ? checkScore.toFixed(2) : '—'}</span>
                  </div>
                </div>
              )}
              <div className={`quiz-footer quiz-footer--${phase}`}>
                {phase === 'review' ? (
                  <>
                    <div className="quiz-footer__prompt">Remember this item.</div>
                    <div className="quiz-footer__actions">
                      <button
                        ref={okRef}
                        onClick={applyRight}
                        className="btn btn--default"
                        type="button"
                        disabled={submitting}
                      >
                        OK
                      </button>
                    </div>
                  </>
                ) : phase === 'check' ? (
                  <>
                    <div className="quiz-footer__prompt">Did you get it right?</div>
                    <div className="quiz-footer__actions">
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
                  </>
                ) : (
                  <div className="quiz-footer__spacer" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
