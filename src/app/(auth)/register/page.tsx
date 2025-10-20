import RegisterForm from './RegisterForm';

function sanitizeCallbackUrl(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  if (!input.startsWith('/')) return undefined;
  return input;
}

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const callbackUrl = sanitizeCallbackUrl(searchParams?.callbackUrl);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Create an account</h1>
        <p className="auth-card__subtitle">Join Genius Next to build and review your decks.</p>
        <RegisterForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
