'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { saveRow, deletePair, createPairInline } from '@/app/deck/[deckId]/actions';

type Row = {
  pairId: string;
  question: string;
  answer: string;
  associationId: string | null;
  score: number;
  order: number;
};

type SortColumn = 'order' | 'question' | 'answer' | 'score';

type SortState = { column: SortColumn; direction: 'asc' | 'desc' };

export default function DeckTable({ deckId, rows }: { deckId: string; rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Row[]>(rows);
  const [sort, setSort] = useState<SortState>({ column: 'order', direction: 'asc' });
  const [pendingFocus, setPendingFocus] = useState<{ id: string; field: 'question' | 'answer' } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    setData(rows);
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

  const updateRow = useCallback((pairId: string, patch: Partial<Row>) => {
    setData((prev) =>
      prev.map((row) =>
        row.pairId === pairId
          ? { ...row, ...patch }
          : row,
      ),
    );
  }, []);

  const removeRow = useCallback((pairId: string) => {
    setData((prev) => prev.filter((row) => row.pairId !== pairId));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = q
      ? data.filter(
          (row) =>
            row.question.toLowerCase().includes(q) ||
            row.answer.toLowerCase().includes(q),
        )
      : data;
    const sorted = [...scoped].sort((a, b) => compareRows(a, b, sort));
    return sorted;
  }, [data, query, sort]);

  const handleCreateRow = useCallback(
    (field: 'question' | 'answer') => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setIsCreating(true);
      createPairInline(deckId)
        .then((created) => {
          setData((prev) => {
            const maxOrder = prev.reduce((acc, row) => Math.max(acc, row.order), -1);
            return [
              ...prev,
              {
                ...created,
                order: maxOrder + 1,
              },
            ];
          });
          setPendingFocus({ id: created.pairId, field });
        })
        .finally(() => {
          creatingRef.current = false;
          setIsCreating(false);
        });
    },
    [deckId],
  );

  const handleSort = useCallback((column: SortColumn) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDirection: SortState['direction'] = column === 'score' ? 'desc' : 'asc';
      return { column, direction: defaultDirection };
    });
  }, []);

  return (
    <div className="boxed table-scroll">
      <div className="table-grid">
        <div className="header grid-4">
          <div className="th index">
            <SortButton label="#" active={sort.column === 'order'} direction={sort.direction} onClick={() => handleSort('order')} />
          </div>
          <div className="th qcol">
            <SortButton label="Question" active={sort.column === 'question'} direction={sort.direction} onClick={() => handleSort('question')} />
          </div>
          <div className="th acol">
            <SortButton label="Answer" active={sort.column === 'answer'} direction={sort.direction} onClick={() => handleSort('answer')} />
          </div>
          <div className="th scol">
            <SortButton label="Score" active={sort.column === 'score'} direction={sort.direction} onClick={() => handleSort('score')} />
          </div>
        </div>
        {filtered.map((row, index) => (
          <RowForm
            key={row.pairId}
            deckId={deckId}
            row={row}
            onUpdate={updateRow}
            onRemove={removeRow}
            position={index}
            focusField={pendingFocus?.id === row.pairId ? pendingFocus.field : undefined}
            onFocusHandled={() => setPendingFocus(null)}
          />
        ))}
        <CreateRowPrompt onActivate={handleCreateRow} isBusy={isCreating} />
        <div className="footer"><div className="spacer" /></div>
      </div>
    </div>
  );
}

function RowForm({
  deckId,
  row,
  onUpdate,
  onRemove,
  position,
  focusField,
  onFocusHandled,
}: {
  deckId: string;
  row: Row;
  onUpdate: (pairId: string, patch: Partial<Row>) => void;
  onRemove: (pairId: string) => void;
  position: number;
  focusField?: 'question' | 'answer';
  onFocusHandled?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const scoreFieldRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const [editingScore, setEditingScore] = useState(false);
  const [scoreDraft, setScoreDraft] = useState(row.score);

  useEffect(() => {
    setScoreDraft(row.score);
    setEditingScore(false);
  }, [row.score]);

  useEffect(() => {
    if (!focusField) return;
    requestAnimationFrame(() => {
      if (focusField === 'question') {
        questionRef.current?.focus();
      } else if (focusField === 'answer') {
        answerRef.current?.focus();
      }
      onFocusHandled?.();
    });
  }, [focusField, onFocusHandled]);

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

  const scoreStyle = useMemo(
    () =>
      ({
        '--score-percent': scoreToPercent(row.score),
        '--score-color': scoreToColor(row.score),
      }) as CSSProperties,
    [row.score],
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
      <div className="td index" aria-hidden="true">{position + 1}</div>
      <div className="td qcol" data-label="Question">
        <input
          ref={questionRef}
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
          ref={answerRef}
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

function CreateRowPrompt({ onActivate, isBusy }: { onActivate: (field: 'question' | 'answer') => void; isBusy: boolean }) {
  return (
    <div className="row grid-4 create-row">
      <div className="td index" aria-hidden="true">+</div>
      <div className="td qcol">
        <button
          type="button"
          className="create-row__input"
          onClick={() => onActivate('question')}
          disabled={isBusy}
        >
          Add question…
        </button>
      </div>
      <div className="td acol">
        <button
          type="button"
          className="create-row__input"
          onClick={() => onActivate('answer')}
          disabled={isBusy}
        >
          Add answer…
        </button>
      </div>
      <div className="td scol" aria-hidden="true">
        <span className="create-row__hint">New cards start at score 0</span>
      </div>
    </div>
  );
}

function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) {
  const ariaLabel = active ? `${label} sorted ${direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`;
  return (
    <button
      type="button"
      className={`sort-button${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className="sort-button__icon" aria-hidden="true">
        {active ? (direction === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
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

function compareRows(a: Row, b: Row, sort: SortState) {
  let result = 0;
  switch (sort.column) {
    case 'question':
      result = a.question.localeCompare(b.question, undefined, { sensitivity: 'base' });
      break;
    case 'answer':
      result = a.answer.localeCompare(b.answer, undefined, { sensitivity: 'base' });
      break;
    case 'score':
      result = a.score - b.score;
      break;
    case 'order':
    default:
      result = a.order - b.order;
      break;
  }
  if (result === 0) {
    result = a.order - b.order;
  }
  return sort.direction === 'asc' ? result : -result;
}
