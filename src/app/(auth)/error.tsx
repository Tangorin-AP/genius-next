'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">Login error</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Something failed while loading the sign-in page.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => reset()}
            className="rounded-md bg-black text-white px-3 py-2 text-sm"
          >
            Try again
          </button>
          <a
            href="/login"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
