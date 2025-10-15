'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { renameDeck } from '@/app/actions';
import DeleteDeckForm from '@/components/DeleteDeckForm';

type Deck = {
  id: string;
  name: string;
  _count: { pairs: number };
};

type Props = {
  deck: Deck;
};

export default function DeckCardManage({ deck }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(deck.name);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setValue(deck.name);
  }, [deck.name]);

  useEffect(() => {
    if (!isEditing) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('deckId', deck.id);
    const nextValue = String(formData.get('name') ?? '').trim();
    if (nextValue === deck.name.trim()) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      await renameDeck(formData);
      setIsEditing(false);
    });
  };

  const handleBlur = () => {
    if (isPending) return;
    setValue(deck.name);
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      formRef.current?.requestSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setValue(deck.name);
      setIsEditing(false);
    }
  };

  const handleEditClick = () => {
    setValue(deck.name);
    setIsEditing(true);
  };

  const nameLink = (
    <Link href={`/deck/${deck.id}`} className="deck-card__name-link">
      <span className="deck-card__name">{deck.name}</span>
    </Link>
  );

  const metaLink = (
    <Link href={`/deck/${deck.id}`} className="deck-card__meta-link">
      <span className="deck-card__meta">{deck._count.pairs} cards</span>
    </Link>
  );

  const linkContent = (
    <>
      <span className="deck-card__name">{deck.name}</span>
      <span className="deck-card__meta">{deck._count.pairs} cards</span>
    </>
  );

  return (
    <article className="deck-card deck-card--manage">
      <div className="deck-card__delete">
        <DeleteDeckForm
          deckId={deck.id}
          className="deck-card__delete-button"
          ariaLabel={`Delete ${deck.name}`}
          title="Delete pack"
        >
          <span aria-hidden="true">🗑</span>
          <span className="sr-only">Delete pack</span>
        </DeleteDeckForm>
      </div>
      <div className="deck-card__header-row">
        <div className="deck-card__title-block">
          {isEditing ? (
            <form
              ref={formRef}
              className="deck-card__rename-inline"
              onSubmit={handleSubmit}
            >
              <input type="hidden" name="deckId" value={deck.id} />
              <input
                ref={inputRef}
                name="name"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={isPending}
                className="deck-card__rename-input"
                placeholder="Pack title"
                aria-label="Pack title"
              />
              <span className="deck-card__meta" aria-live="polite">
                {deck._count.pairs} cards
              </span>
            </form>
          ) : (
            <Link href={`/deck/${deck.id}`} className="deck-card__link">
              {linkContent}
            </Link>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            className="deck-card__edit-button"
            aria-label={`Rename ${deck.name}`}
            onClick={handleEditClick}
            disabled={isPending}
          >
            <span aria-hidden="true">✎</span>
            <span className="sr-only">Rename pack</span>
          </button>
        )}
      </div>
      {isEditing ? (
        <form ref={formRef} className="deck-card__rename-inline" onSubmit={handleSubmit}>
          <input type="hidden" name="deckId" value={deck.id} />
          <input
            ref={inputRef}
            name="name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className="deck-card__rename-input"
            placeholder="Pack title"
            aria-label="Pack title"
          />
          <span className="deck-card__meta" aria-live="polite">
            {deck._count.pairs} cards
          </span>
        </form>
      ) : (
        <div className="deck-card__header">
          <div className="deck-card__title-line">
            {nameLink}
            <button
              type="button"
              className="deck-card__edit-button"
              aria-label={`Rename ${deck.name}`}
              onClick={handleEditClick}
              disabled={isPending}
            >
              <span aria-hidden="true">✎</span>
              <span className="sr-only">Rename pack</span>
            </button>
          </div>
          {metaLink}
        </div>
      )}
    </article>
  );
}
