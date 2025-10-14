export default function MissingDatabaseNotice({ className = '' }: { className?: string }) {
  return (
    <div className={`deck-card deck-card--empty ${className}`.trim()}>
      <span className="deck-card__name">Database connection required</span>
      <span className="deck-card__meta">
        Add a <code>DATABASE_URL</code> environment variable that points to your PostgreSQL database and redeploy.
      </span>
      <span className="deck-card__meta">
        This prevents the app from loading data during the build, which causes Vercel deployments to fail when no database is configured.
      </span>
    </div>
  );
}
