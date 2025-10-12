'use client';

import { useRef } from 'react';
import { importCSVFromForm } from '@/app/deck/[deckId]/actions';

export default function ImportCSVForm({ deckId }: { deckId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="import-form"
      action={importCSVFromForm.bind(null, deckId)}
      encType="multipart/form-data"
    >
      <label className="file-chip">
        <span className="file-chip__label">Import CSV…</span>
        <input
          type="file"
          name="csv"
          accept=".csv,.tsv,text/csv"
          onChange={(event) => {
            if (event.currentTarget.files && event.currentTarget.files.length > 0) {
              formRef.current?.requestSubmit();
            }
          }}
        />
      </label>
    </form>
  );
}
