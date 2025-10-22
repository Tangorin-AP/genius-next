'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import { registerAction } from '../actions';

type RegisterFormState = { error?: string };

const initialState: RegisterFormState = { error: undefined };

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="chip" disabled={pending}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export default function RegisterForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useFormState(async (_state: RegisterFormState, formData: FormData) => {
    const result = await registerAction(formData);
    return result ?? { error: undefined };
  }, initialState);

  return (
    <form action={formAction} className="auth-card__form">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <label className="auth-card__field">
        <span className="auth-card__label">Name</span>
        <input type="text" name="name" autoComplete="name" minLength={2} />
      </label>
      <label className="auth-card__field">
        <span className="auth-card__label">Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="auth-card__field">
        <span className="auth-card__label">Password</span>
        <input type="password" name="password" autoComplete="new-password" required minLength={8} />
      </label>
      {state?.error && <p className="auth-card__error" role="alert">{state.error}</p>}
      <SubmitButton>Create account</SubmitButton>
      <p className="auth-card__hint">
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </form>
  );
}
