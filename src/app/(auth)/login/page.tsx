import { Suspense } from 'react';

import LoginForm from './login-form';

function LoginFallback() {
  return (
    <div className="auth-card" aria-busy="true">
      <h1 className="auth-card__title">Sign in</h1>
      <p className="auth-card__subtitle">Loading…</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
