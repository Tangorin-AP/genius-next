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

type ScoreEvent = CustomEvent<{ pairId: string; score: number }>;

function clampScore(score: number) {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score)));
}

function scoreToPercent(score: number) {
  const clamped = clampScore(score);
  return `${(clamped / 10) * 100}%`;
}

function scoreToColor(score: number) {
  const clamped = clampScore(score);
  const r = Math.round(233 - (clamped / 10) * (233 - 63));
  const g = Math.round(99 + (clamped / 10) * (181 - 99));
  const b = Math.round(99 + (clamped / 10) * (115 - 99));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function DeckTable({ deckId, rows }: { deckId: string; rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [localRows, setLocalRows] = useState(rows);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  useEffect(() => {
    const onSearch = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setQuery(customEvent.detail || '');
    };

    const onScore = (event: Event) => {
      const { detail } = event as ScoreEvent;
      if (!detail) return;
      setLocalRows((prev) =>
        prev.map((row) =>
          row.pairId === detail.pairId
            ? { ...row, score: clampScore(detail.score) }
            : row,
        ),
      );
    };

    window.addEventListener('deck-search', onSearch as EventListener);
    window.addEventListener('deck-score', onScore as EventListener);
    return () => {
      window.removeEventListener('deck-search', onSearch as EventListener);
      window.removeEventListener('deck-score', onScore as EventListener);
    };
  }, []);

  const updateRow = useCallback((pairId: string, patch: Partial<Row>) => {
    setLocalRows((prev) =>
      prev.map((row) =>
        row.pairId === pairId
          ? { ...row, ...patch }
          : row,
      ),
    );
  }, []);

  const removeRow = useCallback((pairId: string) => {
    setLocalRows((prev) => prev.filter((row) => row.pairId !== pairId));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dataset = localRows;
    if (!q) return dataset;
    return dataset.filter(
      (row) =>
        row.question.toLowerCase().includes(q) ||
        row.answer.toLowerCase().includes(q),
    );
  }, [localRows, query]);

  return (
    <div className="boxed table-scroll">
      <div className="table-grid">
        <div className="header">
          <div className="th chk" aria-hidden="true" />
          <div className="th qcol">Question</div>
          <div className="th acol">Answer</div>
          <div className="th scol">Score</div>
        </div>
        {filtered.map((row) => (
          <RowForm
            key={row.pairId}
            deckId={deckId}
            row={row}
            onUpdate={updateRow}
            onRemove={removeRow}
          />
        ))}
        <div className="table-spacer" />
      </div>
    </div>
  );
}

function RowForm({
  deckId,
  row,
  onUpdate,
  onRemove,
}: {
  deckId: string;
  row: Row;
  onUpdate: (pairId: string, patch: Partial<Row>) => void;
  onRemove: (pairId: string) => void;
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

  return (
    <form ref={formRef} className="row grid-4" action={saveRow}>
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
            style={{
              '--score-percent': scoreToPercent(row.score),
              '--score-color': scoreToColor(row.score),
            } as CSSProperties}
          >
            <span className="score-chip__track">
              <span className="score-chip__dot" />
            </span>
            <span className="score-chip__value">{clampScore(row.score)}</span>
          </div>
          <button
            className="chip chip--danger"
            type="submit"
            formAction={deletePair}
            onClick={() => onRemove(row.pairId)}
          >
            Delete
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
