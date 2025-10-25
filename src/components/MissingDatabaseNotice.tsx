type MissingDatabaseNoticeProps = {
  className?: string;
  kind?: 'missing' | 'unreachable';
  hint?: string;
};

const COPY = {
  missing: {
    title: 'Database connection required',
    message:
      'Add a DATABASE_URL environment variable that points to your PostgreSQL database and redeploy.',
    detail:
      'This prevents the app from loading data during the build, which causes Vercel deployments to fail when no database is configured.',
  },
  unreachable: {
    title: 'Database unreachable',
    message: 'We tried to connect to your configured database but it did not respond.',
    detail: 'Verify the DATABASE_URL, network access, and that the database is online, then try again.',
  },
} as const;

export default function MissingDatabaseNotice({
  className = '',
  kind = 'missing',
  hint,
}: MissingDatabaseNoticeProps) {
  const copy = COPY[kind] ?? COPY.missing;
  return (
    <div className={`deck-card deck-card--empty ${className}`.trim()}>
      <span className="deck-card__name">{copy.title}</span>
      <span className="deck-card__meta">{copy.message}</span>
      <span className="deck-card__meta">{copy.detail}</span>
      {hint ? (
        <span className="deck-card__meta" aria-live="polite">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
