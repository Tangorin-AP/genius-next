import LoginForm from './LoginForm';

function sanitizeCallbackUrl(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  if (!input.startsWith('/')) return undefined;
  return input;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const callbackUrl = sanitizeCallbackUrl(searchParams?.callbackUrl);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Sign in</h1>
        <p className="auth-card__subtitle">Welcome back! Enter your details to continue.</p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
