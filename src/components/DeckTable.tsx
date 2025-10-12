'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
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
  const [data, setData] = useState<Row[]>(rows);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const submittersRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    setData(rows);
    setDirtyIds(new Set());
  }, [rows]);

  useEffect(() => {
    const onSearch = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setQuery(customEvent.detail || '');
    };

    window.addEventListener('deck-search', onSearch as EventListener);
    return () => window.removeEventListener('deck-search', onSearch as EventListener);
  }, []);

  const handleScoreBroadcast = useCallback((event: Event) => {
    const custom = event as CustomEvent<{ pairId: string; score: number }>;
    if (!custom.detail) return;
    const { pairId, score } = custom.detail;
    const safeScore = clampScore(score);
    setData((prev) =>
      prev.map((row) =>
        row.pairId === pairId
          ? { ...row, score: safeScore }
          : row,
      ),
    );
  }, []);

  useEffect(() => {
    window.addEventListener('deck-score', handleScoreBroadcast as EventListener);
    return () => window.removeEventListener('deck-score', handleScoreBroadcast as EventListener);
  }, [handleScoreBroadcast]);

  const markDirty = useCallback((pairId: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (dirty) {
        next.add(pairId);
      } else {
        next.delete(pairId);
      }
      return next;
    });
  }, []);

  const registerSubmitter = useCallback((pairId: string, submitter: () => void) => {
    submittersRef.current.set(pairId, submitter);
    return () => {
      submittersRef.current.delete(pairId);
    };
  }, []);

  const updateRow = useCallback(
    (pairId: string, patch: Partial<Row>) => {
      setData((prev) =>
        prev.map((row) =>
          row.pairId === pairId
            ? { ...row, ...patch }
            : row,
        ),
      );
      markDirty(pairId, true);
    },
    [markDirty],
  );

  const removeRow = useCallback((pairId: string) => {
    setData((prev) => prev.filter((row) => row.pairId !== pairId));
    setDirtyIds((prev) => {
      if (!prev.has(pairId)) return prev;
      const next = new Set(prev);
      next.delete(pairId);
      return next;
    });
  }, []);

  const commitRow = useCallback((pairId: string) => {
    markDirty(pairId, false);
  }, [markDirty]);

  const handleSaveAll = useCallback(() => {
    const submitters = submittersRef.current;
    for (const pairId of dirtyIds) {
      submitters.get(pairId)?.();
    }
  }, [dirtyIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (row) =>
        row.question.toLowerCase().includes(q) ||
        row.answer.toLowerCase().includes(q),
    );
  }, [data, query]);

  const hasDirty = dirtyIds.size > 0;

  return (
    <>
      <div className="table-actions">
        <button
          type="button"
          className="chip chip--primary"
          onClick={handleSaveAll}
          disabled={!hasDirty}
        >
          Save changes
        </button>
        <span className="table-actions__hint">Use this to confirm edits and deletions.</span>
      </div>
      <div className="boxed table-scroll">
        <div className="table-grid">
          <div className="header">
            <div className="th chk" />
            <div className="th qcol">Question</div>
            <div className="th acol">Answer</div>
            <div className="th scol">Score</div>
          </div>
          {filtered.map((row) => (
            <RowForm
              key={row.pairId}
              deckId={deckId}
              row={row}
              dirty={dirtyIds.has(row.pairId)}
              onUpdate={updateRow}
              onRemove={removeRow}
              onCommit={commitRow}
              registerSubmit={registerSubmitter}
            />
          ))}
          <div className="footer"><div className="spacer" /></div>
        </div>
      </div>
    </>
  );
}

function RowForm({
  deckId,
  row,
  dirty,
  onUpdate,
  onRemove,
  onCommit,
  registerSubmit,
}: {
  deckId: string;
  row: Row;
  dirty: boolean;
  onUpdate: (pairId: string, patch: Partial<Row>) => void;
  onRemove: (pairId: string) => void;
  onCommit: (pairId: string) => void;
  registerSubmit: (pairId: string, submitter: () => void) => () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const scoreFieldRef = useRef<HTMLInputElement>(null);
  const [editingScore, setEditingScore] = useState(false);
  const [scoreDraft, setScoreDraft] = useState(row.score);

  useEffect(() => {
    setScoreDraft(row.score);
    setEditingScore(false);
  }, [row.score]);

  const requestSubmit = useCallback(() => {
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  }, []);

  useEffect(() => registerSubmit(row.pairId, requestSubmit), [registerSubmit, row.pairId, requestSubmit]);

  const handleFieldBlur = useCallback(() => {
    requestSubmit();
  }, [requestSubmit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        requestSubmit();
      }
    },
    [requestSubmit],
  );

  const openScoreEditor = useCallback(() => {
    setScoreDraft(row.score);
    setEditingScore(true);
    requestAnimationFrame(() => {
      scoreInputRef.current?.focus();
      scoreInputRef.current?.select();
    });
  }, [row.score]);

  const closeScoreEditor = useCallback(
    (commit: boolean) => {
      if (commit) {
        const nextScore = clampScore(Number(scoreDraft));
        if (scoreFieldRef.current) {
          scoreFieldRef.current.value = String(nextScore);
        }
        onUpdate(row.pairId, { score: nextScore });
        requestSubmit();
      } else {
        setScoreDraft(row.score);
      }
      setEditingScore(false);
    },
    [scoreDraft, onUpdate, row.pairId, row.score, requestSubmit, scoreFieldRef],
  );

  const handleScoreKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeScoreEditor(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeScoreEditor(false);
      }
    },
    [closeScoreEditor],
  );

  const scoreStyle = useMemo(
    () =>
      ({
        '--score-percent': scoreToPercent(row.score),
        '--score-color': scoreToColor(row.score),
      }) as CSSProperties,
    [row.score],
  );

  return (
    <form
      ref={formRef}
      className="row grid-4"
      data-dirty={dirty ? 'true' : undefined}
      action={saveRow}
      onSubmitCapture={() => onCommit(row.pairId)}
    >
      <input type="hidden" name="deckId" value={deckId} />
      <input type="hidden" name="pairId" value={row.pairId} />
      <input type="hidden" name="associationId" value={row.associationId ?? ''} />
      <input
        ref={scoreFieldRef}
        type="hidden"
        name="score"
        value={clampScore(row.score)}
        readOnly
      />
      <div className="td chk" aria-hidden="true">
        <input type="checkbox" defaultChecked />
      </div>
      <div className="td qcol" data-label="Question">
        <input
          name="question"
          type="text"
          value={row.question}
          onChange={(event) => onUpdate(row.pairId, { question: event.currentTarget.value })}
          onBlur={handleFieldBlur}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="td acol" data-label="Answer">
        <input
          name="answer"
          type="text"
          value={row.answer}
          onChange={(event) => onUpdate(row.pairId, { answer: event.currentTarget.value })}
          onBlur={handleFieldBlur}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="td scol" data-label="Score">
        <div className="score-cell">
          <div
            className="score-chip"
            role="button"
            tabIndex={0}
            onDoubleClick={openScoreEditor}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openScoreEditor();
              }
            }}
            title="Double-click to edit score"
            style={scoreStyle}
          >
            <span className="score-chip__track">
              <span className="score-chip__dot" />
            </span>
            <span className="score-chip__value">{clampScore(row.score)}</span>
          </div>
          <button
            className="chip chip--danger chip--icon"
            type="submit"
            formAction={deletePair}
            onClick={() => onRemove(row.pairId)}
            aria-label="Delete card"
            title="Delete card"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {editingScore && (
          <div className="score-edit">
            <input
              ref={scoreInputRef}
              type="number"
              min={0}
              max={10}
              value={scoreDraft}
              onChange={(event) => setScoreDraft(Number(event.currentTarget.value))}
              onBlur={() => closeScoreEditor(true)}
              onKeyDown={handleScoreKey}
            />
            <span className="score-edit__hint">↵ to save, Esc to cancel</span>
          </div>
        )}
      </div>
    </form>
  );
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(10, Math.round(value)));
}

function scoreToPercent(score: number) {
  return `${(clampScore(score) / 10) * 100}%`;
}

function scoreToColor(score: number) {
  const clamped = clampScore(score);
  const hue = (clamped / 10) * 120; // 0 = red, 120 = green
  return `hsl(${Math.round(hue)}, 70%, 50%)`;
}
