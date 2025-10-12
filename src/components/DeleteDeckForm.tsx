'use client';

import { ReactNode } from 'react';
import { deleteDeck } from '@/app/actions';

type Props = {
  deckId: string;
  redirectTo?: string;
  className?: string;
  children: ReactNode;
};

export default function DeleteDeckForm({ deckId, redirectTo, className, children }: Props) {
  return (
    <form
      action={deleteDeck}
      onSubmit={(event) => {
        if (!confirm('Delete this pack? Cards inside will also be removed.')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <input type="hidden" name="deckId" value={deckId} />
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <button type="submit" className={className}>{children}</button>
    </form>
  );
}
