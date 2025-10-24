'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { FormEvent, useState } from 'react';

function sanitizeCallbackUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('/')) return undefined;
  return value;
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email');
    const password = formData.get('password');

    if (typeof email !== 'string' || typeof password !== 'string') {
      setError('Invalid email or password');
      setPending(false);
      return;
    }

// Let NextAuth set the cookie and perform the redirect server-side:
await signIn("credentials", {
  email,
  password,
  callbackUrl: callbackUrl ?? "/study",
});
// No `redirect: false`, no manual window.location

  return (
    <div className="auth-card">
      <h1 className="auth-card__title">Sign in</h1>
      <p className="auth-card__subtitle">Welcome back! Enter your details to continue.</p>
      <form className="auth-card__form" onSubmit={handleSubmit}>
        {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
        <label className="auth-card__field">
          <span className="auth-card__label">Email</span>
          <input type="email" name="email" autoComplete="email" required disabled={pending} />
        </label>
        <label className="auth-card__field">
          <span className="auth-card__label">Password</span>
          <input type="password" name="password" autoComplete="current-password" required minLength={8} disabled={pending} />
        </label>
        {error ? (
          <p className="auth-card__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="chip" disabled={pending}>
          {pending ? 'Please wait…' : 'Sign in'}
        </button>
        <p className="auth-card__hint">
          Don&apos;t have an account? <Link href="/register">Create one</Link>.
        </p>
      </form>
    </div>
  );
}
