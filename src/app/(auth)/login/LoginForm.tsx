'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import { loginAction } from '../actions';

const initialState = { error: undefined as string | undefined };

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="chip" disabled={pending}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export default function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="auth-card__form">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <label className="auth-card__field">
        <span className="auth-card__label">Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-card__field">
        <span className="auth-card__label">Password</span>
        <input type="password" name="password" autoComplete="current-password" required minLength={8} />
      </label>
      {state?.error && <p className="auth-card__error" role="alert">{state.error}</p>}
      <SubmitButton>Sign in</SubmitButton>
      <p className="auth-card__hint">
        Don&apos;t have an account? <Link href="/register">Create one</Link>.
      </p>
    </form>
  );
}
