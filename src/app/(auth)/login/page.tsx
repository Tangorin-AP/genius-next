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

// src/app/(auth)/login/page.tsx
import { signIn } from "@/auth";

export default function LoginPage() {
  async function login(formData: FormData) {
    "use server";
    // Send them straight to your study page after success
    await signIn("credentials", formData, { redirectTo: "/study" });
  }

  return (
    <form action={login}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Sign in</button>
    </form>
  );
}
