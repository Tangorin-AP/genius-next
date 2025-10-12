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
  async function action(formData: FormData) {
    'use server';

    formData.set('deckId', deckId);
    if (redirectTo) {
      formData.set('redirectTo', redirectTo);
    }

    await deleteDeck(formData);
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm('Delete this pack? Cards inside will also be removed.')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <button type="submit" className={className}>{children}</button>
    </form>
  );
}
