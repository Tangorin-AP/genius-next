'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RawSessionPlan, SessionCard, SessionScheduler } from '@/lib/session';
import { computeCorrectness, defaultMatchingMode, MatchingMode, normalizeAnswerDisplay } from '@/lib/matching';
import { UNSCHEDULED_SAMPLE_COUNT } from '@/lib/constants';

const PASS_THRESHOLD = 0.5;

type StudyParams = {
  slider: number;
  minimumScore: number;
  mode: MatchingMode;
};

const DEFAULT_PARAMS: StudyParams = { slider: 0, minimumScore: -1, mode: defaultMatchingMode() };

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
    return {
      slider,
      minimumScore,
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

export default function StudyModal({ deckId }: { deckId: string }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
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
  const closeTimeoutRef = useRef<number | null>(null);
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
    setSubmitting(false);
    setPhase('quiz');
    setProgress({ seen: 0, total: 0 });
    inputRef.current?.blur();
  }, []);

  const close = useCallback(() => {
    if (!visible || closing) return;
    setClosing(true);
    if (closeTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (typeof window === 'undefined') {
      setVisible(false);
      setClosing(false);
      teardownSession();
      return;
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      setVisible(false);
      setClosing(false);
      teardownSession();
    }, 180);
  }, [closing, teardownSession, visible]);

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
    return () => {
      if (closeTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onSubmitFromToolbar = (event: Event) => {
      const target = event.target as HTMLFormElement | null;
      if (target && target.id === 'studyForm') {
        event.preventDefault();
        if (closeTimeoutRef.current !== null && typeof window !== 'undefined') {
          window.clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
        setClosing(false);
        teardownSession();
        setVisible(true);
        setRequestVersion((value) => value + 1);
      }
    };
    document.addEventListener('submit', onSubmitFromToolbar);
    return () => document.removeEventListener('submit', onSubmitFromToolbar);
  }, [teardownSession]);

  useEffect(() => {
    if (!visible || closing) return;
    let active = true;
    setLoading(true);
    setError(null);
    const params = readParams();
    paramsRef.current = params;
    fetchSelection(deckId, params)
      .then((plan) => {
        if (!active) return;
        const slider = paramsRef.current.slider;
        const reviewBias = Math.max(0, Math.min(1, slider / 100));
        const scheduler = new SessionScheduler(plan, { reviewBias });
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
  }, [closing, deckId, takeNextCard, visible, requestVersion]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (visible || closing) {
      document.body.dataset.studyOpen = 'true';
    } else {
      delete document.body.dataset.studyOpen;
    }
    return () => {
      delete document.body.dataset.studyOpen;
    };
  }, [closing, visible]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!(visible || closing)) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [closing, visible]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!visible || closing) return;
    if (!current) return;
    if (phase === 'check') return;
    const frame = window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (phase === 'review' || el.value) {
        el.select();
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [closing, current, phase, visible]);

  const refreshProgress = useCallback(() => {
    if (!scheduler) {
      setProgress({ seen: 0, total: 0 });
      return;
    }
    setProgress(scheduler.progress());
  }, [scheduler]);

  const next = useCallback(() => {
    takeNextCard(scheduler);
    refreshProgress();
  }, [refreshProgress, scheduler, takeNextCard]);

  const applyRight = useCallback(async () => {
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
  }, [current, next, scheduler, submitting]);

  const applyWrong = useCallback(async () => {
    if (!current || !scheduler || submitting) return;
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', {
        method: 'POST',
        body: JSON.stringify({ associationId: current.id, decision: 'WRONG' }),
      });
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
  }, [current, next, scheduler, submitting]);

  const applySkip = useCallback(async () => {
    if (!current || !scheduler || submitting) return;
    inputRef.current?.blur();
    setSubmitting(true);
    try {
      const res = await fetch('/api/mark', {
        method: 'POST',
        body: JSON.stringify({ associationId: current.id, decision: 'SKIP' }),
      });
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
  }, [current, next, scheduler, submitting]);

  const doSubmit = useCallback(async () => {
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
  }, [applyRight, current, input, scheduler, submitting]);

  useEffect(() => {
    if (!visible || closing) return;
    const handleKey = (event: KeyboardEvent) => {
      if (phase !== 'check') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
          return;
        }
      }
      const key = event.key.toLowerCase();
      if (key === 'y') {
        event.preventDefault();
        void applyRight();
      } else if (key === 'n') {
        event.preventDefault();
        void applyWrong();
      } else if (key === 's') {
        event.preventDefault();
        void applySkip();
      } else if (key === 'enter') {
        event.preventDefault();
        if (autoChoice === 'YES') {
          void applyRight();
        } else if (autoChoice === 'NO') {
          void applyWrong();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applyRight, applySkip, applyWrong, autoChoice, closing, phase, visible]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(visible || closing)) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [close, closing, visible]);


  if (!visible) return null;

  const isIntro = Boolean(current?.firstTime);
  const metaLabel = isIntro ? 'New item' : null;
  const progressPercent = progress.total === 0 ? 0 : Math.min(1, progress.seen / progress.total);
  const showAnswer = Boolean(current && (phase === 'review' || phase === 'check'));
  const answerDisplay = showAnswer ? current?.answer ?? '' : '';
  const disableEntry = submitting || phase === 'check';
  const typedLabel = normalizeAnswerDisplay(input);
  const expectedLabel = current ? normalizeAnswerDisplay(current.answer) : '';
  const overlayClassName = `screen screen--study${closing ? ' screen--closing' : ''}`;
  const modalClassName = `modal boxed modal--study${closing ? ' modal--closing' : ''}`;
  const bodyClassName = `modal-body${isIntro ? ' modal-body--intro' : ''}`;

  return (
    <div className={overlayClassName}>
      <div className={modalClassName}>
        <div className="modal-header">
          <div className="title">Study</div>
          <div className="spacer" />
          <button className="icon" type="button" onClick={close}>×</button>
        </div>
        <div className={bodyClassName}>
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
                    {metaLabel && <span className="quiz-meta__label">{metaLabel}</span>}
                  </div>
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
