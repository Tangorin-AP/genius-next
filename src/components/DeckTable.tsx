'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveRow } from '@/app/deck/[deckId]/actions';

type Row = {
  pairId: string;
  question: string;
  answer: string;
  associationId: string | null;
  score: number;
};

type FocusField = 'question' | 'answer';

type RowState = Row & {
  clientId: string;
  originalIndex: number;
  dirty: boolean;
  deleted: boolean;
  isNew: boolean;
};

export default function DeckTable({ deckId, rows }: { deckId: string; rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<RowState[]>(() =>
    rows.map((row, index) => ({
      ...row,
      clientId: row.pairId,
      originalIndex: index,
      dirty: false,
      deleted: false,
      isNew: false,
    })),
  );
  const [sort, setSort] = useState<{ column: 'question' | 'answer' | 'score' | null; direction: 'asc' | 'desc' }>({
    column: null,
    direction: 'asc',
  });
  const [focusRequest, setFocusRequest] = useState<{ clientId: string; field: FocusField } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const submittersRef = useRef(new Map<string, () => void>());
  const router = useRouter();
  const originalsRef = useRef(new Map<string, Row>());

  useEffect(() => {
    const base = new Map<string, Row>();
    rows.forEach((row) => base.set(row.pairId, row));
    originalsRef.current = base;
    setData(
      rows.map((row, index) => ({
        ...row,
        clientId: row.pairId,
        originalIndex: index,
        dirty: false,
        deleted: false,
        isNew: false,
      })),
    );
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
      prev.map((row) => {
        if (row.pairId !== pairId) return row;
        const base = originalsRef.current.get(pairId);
        originalsRef.current.set(pairId, {
          pairId,
          question: base?.question ?? row.question,
          answer: base?.answer ?? row.answer,
          associationId: row.associationId,
          score: safeScore,
        });
        const next: RowState = { ...row, score: safeScore };
        const dirty = determineDirty(next, originalsRef.current.get(pairId));
        return { ...next, dirty };
      }),
    );
  }, []);

  useEffect(() => {
    window.addEventListener('deck-score', handleScoreBroadcast as EventListener);
    return () => window.removeEventListener('deck-score', handleScoreBroadcast as EventListener);
  }, [handleScoreBroadcast]);

  const registerSubmitter = useCallback((clientId: string, submitter: () => void) => {
    submittersRef.current.set(clientId, submitter);
    return () => {
      submittersRef.current.delete(clientId);
    };
  }, []);

  const updateRow = useCallback((clientId: string, patch: Partial<RowState>) => {
    setData((prev) =>
      prev.map((row) => {
        if (row.clientId !== clientId) return row;
        const next: RowState = { ...row, ...patch };
        const base = row.isNew ? undefined : originalsRef.current.get(row.pairId);
        return { ...next, dirty: determineDirty(next, base) };
      }),
    );
  }, []);

  const toggleDeleteRow = useCallback((clientId: string, deleted: boolean) => {
    setData((prev) => {
      const next: RowState[] = [];
      for (const row of prev) {
        if (row.clientId !== clientId) {
          next.push(row);
          continue;
        }
        if (row.isNew && deleted) {
          submittersRef.current.delete(row.clientId);
          continue;
        }
        const base = originalsRef.current.get(row.pairId);
        const candidate: RowState = { ...row, deleted };
        next.push({ ...candidate, dirty: determineDirty(candidate, base) });
      }
      return next;
    });
  }, []);

  const commitRow = useCallback((clientId: string, meta?: { deleted?: boolean; isNew?: boolean }) => {
    setData((prev) => {
      if (meta?.deleted || meta?.isNew) {
        submittersRef.current.delete(clientId);
        return prev.filter((row) => row.clientId !== clientId);
      }
      return prev.map((row) => (row.clientId === clientId ? { ...row, dirty: false } : row));
    });
  }, []);

  const handleSaveAll = useCallback(() => {
    const dirtyRows = data.filter((row) => row.dirty);
    if (!dirtyRows.length) return;
    const submitters = submittersRef.current;
    setSaving(true);
    dirtyRows.forEach((row) => {
      submitters.get(row.clientId)?.();
    });
    setTimeout(() => {
      setSaving(false);
      startTransition(() => {
        router.refresh();
      });
    }, 200);
  }, [data, router, startTransition]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = data.filter((row) => !row.deleted);
    const matches = !q
      ? active
      : active.filter(
          (row) =>
            row.question.toLowerCase().includes(q) ||
            row.answer.toLowerCase().includes(q),
        );
    const deletedRows = data.filter((row) => row.deleted);
    const sortKey = sort.column;
    const sortedActive = [...matches].sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
      if (!sortKey) return a.originalIndex - b.originalIndex;
      let result = 0;
      if (sortKey === 'score') {
        result = clampScore(a.score) - clampScore(b.score);
      } else {
        result = a[sortKey].localeCompare(b[sortKey]);
      }
      return sort.direction === 'asc' ? result : -result;
    });
    return [...sortedActive, ...deletedRows];
  }, [data, query, sort]);

  const hasDirty = data.some((row) => row.dirty);

  const handleAddRow = useCallback(
    (field: FocusField) => {
      const newId = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setData((prev) => [
        ...prev,
        {
          clientId: newId,
          pairId: '',
          question: '',
          answer: '',
          associationId: null,
          score: 0,
          originalIndex: prev.length + 1,
          dirty: false,
          deleted: false,
          isNew: true,
        },
      ]);
      setFocusRequest({ clientId: newId, field });
    },
    [],
  );

  const handleSort = useCallback((column: 'question' | 'answer' | 'score') => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  }, []);

  return (
    <>
      <div className="table-actions">
        <button
          type="button"
          className="chip chip--primary"
          onClick={handleSaveAll}
          disabled={!hasDirty || saving || isRefreshing}
        >
          {saving || isRefreshing ? 'Saving…' : 'Save changes'}
        </button>
        <span className="table-actions__hint">Use this to confirm edits and deletions.</span>
      </div>
      <div className="boxed table-scroll">
        <div className="table-grid">
          <div className="header">
            <div className="th chk" />
            <HeaderButton
              className="th qcol"
              label="Question"
              active={sort.column === 'question'}
              direction={sort.direction}
              onClick={() => handleSort('question')}
            />
            <HeaderButton
              className="th acol"
              label="Answer"
              active={sort.column === 'answer'}
              direction={sort.direction}
              onClick={() => handleSort('answer')}
            />
            <HeaderButton
              className="th scol"
              label="Score"
              active={sort.column === 'score'}
              direction={sort.direction}
              onClick={() => handleSort('score')}
            />
          </div>
          {filtered.map((row) => (
            <RowForm
              key={row.clientId}
              deckId={deckId}
              row={row}
              onUpdate={updateRow}
              onToggleDelete={toggleDeleteRow}
              onCommit={commitRow}
              registerSubmit={registerSubmitter}
              autoFocusField={focusRequest?.clientId === row.clientId ? focusRequest.field : undefined}
              onAutoFocusHandled={() => {
                if (focusRequest?.clientId === row.clientId) {
                  setFocusRequest(null);
                }
              }}
            />
          ))}
          <AddRow onAdd={handleAddRow} />
          <div className="footer"><div className="spacer" /></div>
        </div>
      </div>
    </>
  );
}

type HeaderButtonProps = {
  className: string;
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
};

function HeaderButton({ className, label, active, direction, onClick }: HeaderButtonProps) {
  return (
    <div
      className={className}
      role="columnheader"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`sort-button${active ? ' sort-button--active' : ''}`}
        onClick={onClick}
      >
        <span className="sort-button__label">{label}</span>
        <span className="sort-indicator" aria-hidden="true">
          {active ? (direction === 'asc' ? '▲' : '▼') : '▵'}
        </span>
      </button>
    </div>
  );
}

type AddRowProps = {
  onAdd: (field: FocusField) => void;
};

function AddRow({ onAdd }: AddRowProps) {
  const handleKey = (field: FocusField) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAdd(field);
    }
  };

  return (
    <div className="row add-row grid-4" aria-hidden="false">
      <div className="td chk" aria-hidden="true">
        <span className="add-row__icon">＋</span>
      </div>
      <div className="td qcol" data-label="Question">
        <button
          type="button"
          className="add-row__field"
          onClick={() => onAdd('question')}
          onKeyDown={handleKey('question')}
        >
          Add a question…
        </button>
      </div>
      <div className="td acol" data-label="Answer">
        <button
          type="button"
          className="add-row__field"
          onClick={() => onAdd('answer')}
          onKeyDown={handleKey('answer')}
        >
          Add an answer…
        </button>
      </div>
      <div className="td scol add-row__hint" data-label="Score">
        New cards begin at score 0
      </div>
    </div>
  );
}

type RowFormProps = {
  deckId: string;
  row: RowState;
  onUpdate: (clientId: string, patch: Partial<RowState>) => void;
  onToggleDelete: (clientId: string, deleted: boolean) => void;
  onCommit: (clientId: string, meta?: { deleted?: boolean; isNew?: boolean }) => void;
  registerSubmit: (clientId: string, submitter: () => void) => () => void;
  autoFocusField?: FocusField;
  onAutoFocusHandled?: () => void;
};

function RowForm({
  deckId,
  row,
  onUpdate,
  onToggleDelete,
  onCommit,
  registerSubmit,
  autoFocusField,
  onAutoFocusHandled,
}: RowFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const scoreFieldRef = useRef<HTMLInputElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);
  const [editingScore, setEditingScore] = useState(false);
  const [scoreDraft, setScoreDraft] = useState(String(clampScore(row.score)));

  useEffect(() => {
    setScoreDraft(String(clampScore(row.score)));
    setEditingScore(false);
  }, [row.score]);

  const requestSubmit = useCallback(() => {
    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  }, []);

  useEffect(() => registerSubmit(row.clientId, requestSubmit), [registerSubmit, row.clientId, requestSubmit]);

  useEffect(() => {
    if (!autoFocusField) return;
    const target = autoFocusField === 'question' ? questionInputRef.current : answerInputRef.current;
    if (target) {
      target.focus();
      target.select();
      onAutoFocusHandled?.();
    }
  }, [autoFocusField, onAutoFocusHandled]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
      }
    },
    [],
  );

  const openScoreEditor = useCallback(() => {
    if (row.deleted) return;
    setScoreDraft(String(clampScore(row.score)));
    setEditingScore(true);
    requestAnimationFrame(() => {
      scoreInputRef.current?.focus();
      scoreInputRef.current?.select();
    });
  }, [row.score, row.deleted]);

  const closeScoreEditor = useCallback(
    (commit: boolean) => {
      if (commit) {
        const nextScore = clampScore(Number(scoreDraft));
        if (scoreFieldRef.current) {
          scoreFieldRef.current.value = String(nextScore);
        }
        setScoreDraft(String(nextScore));
        onUpdate(row.clientId, { score: nextScore });
      } else {
        setScoreDraft(String(clampScore(row.score)));
      }
      setEditingScore(false);
    },
    [scoreDraft, onUpdate, row.clientId, row.score],
  );

  const handleScoreKey = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        closeScoreEditor(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
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
      data-dirty={row.dirty ? 'true' : undefined}
      data-deleted={row.deleted ? 'true' : undefined}
      action={saveRow}
      onSubmitCapture={() => onCommit(row.clientId, { deleted: row.deleted, isNew: row.isNew })}
    >
      <input type="hidden" name="deckId" value={deckId} />
      <input type="hidden" name="pairId" value={row.pairId} />
      <input type="hidden" name="associationId" value={row.associationId ?? ''} />
      <input type="hidden" name="intent" value={row.deleted ? 'delete' : 'save'} />
      <input
        ref={scoreFieldRef}
        type="hidden"
        name="score"
        value={clampScore(row.score)}
        readOnly
      />
      <div className="td chk" aria-hidden="true">
        <span className="row-status" aria-hidden="true">
          {row.deleted ? '⨯' : row.dirty ? '●' : '•'}
        </span>
      </div>
      <div className="td qcol" data-label="Question">
        <input
          ref={questionInputRef}
          name="question"
          type="text"
          value={row.question}
          onChange={(event) => onUpdate(row.clientId, { question: event.currentTarget.value })}
          onKeyDown={handleKeyDown}
          disabled={row.deleted}
          placeholder={row.isNew ? 'Type a question…' : undefined}
        />
      </div>
      <div className="td acol" data-label="Answer">
        <input
          ref={answerInputRef}
          name="answer"
          type="text"
          value={row.answer}
          onChange={(event) => onUpdate(row.clientId, { answer: event.currentTarget.value })}
          onKeyDown={handleKeyDown}
          disabled={row.deleted}
          placeholder={row.isNew ? 'Type an answer…' : undefined}
        />
      </div>
      <div className="td scol" data-label="Score">
        <div className="score-cell">
          <div
            className={`score-chip${editingScore ? ' score-chip--editing' : ''}`}
            role="button"
            tabIndex={row.deleted ? -1 : 0}
            aria-disabled={row.deleted}
            onDoubleClick={openScoreEditor}
            onKeyDown={(event) => {
              if (editingScore || row.deleted) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openScoreEditor();
              }
            }}
            title={
              row.deleted
                ? 'Restore to edit score'
                : editingScore
                  ? 'Type a score, press Enter to save'
                  : 'Double-click to edit score'
            }
            style={scoreStyle}
          >
            <span className="score-chip__track">
              <span className="score-chip__dot" />
            </span>
            {editingScore && !row.deleted ? (
              <input
                ref={scoreInputRef}
                className="score-chip__input"
                type="number"
                min={0}
                max={10}
                value={scoreDraft}
                onChange={(event) => setScoreDraft(event.currentTarget.value)}
                onBlur={() => closeScoreEditor(true)}
                onKeyDown={handleScoreKey}
              />
            ) : (
              <span className="score-chip__value">{clampScore(row.score)}</span>
            )}
          </div>
          <button
            className={`chip chip--danger chip--icon${row.deleted ? ' chip--active' : ''}`}
            type="button"
            onClick={() => onToggleDelete(row.clientId, !row.deleted)}
            aria-label={row.deleted ? 'Undo delete' : 'Delete card'}
            title={row.deleted ? 'Undo delete' : 'Delete card'}
          >
            <span aria-hidden="true">{row.deleted ? '↺' : '×'}</span>
          </button>
        </div>
      </div>
      {row.deleted && (
        <div className="row__overlay" aria-hidden="true">
          <span>This card will be deleted when you save.</span>
        </div>
      )}
    </form>
  );
}

function determineDirty(row: RowState, base?: Row) {
  if (row.isNew) return true;
  if (row.deleted) return true;
  if (!base) return false;
  return (
    base.question !== row.question ||
    base.answer !== row.answer ||
    clampScore(base.score) !== clampScore(row.score)
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
