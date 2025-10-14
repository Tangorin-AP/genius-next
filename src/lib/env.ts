export function databaseUrl(): string | null {
  const value = process.env.DATABASE_URL;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function hasDatabaseUrl(): boolean {
  return databaseUrl() !== null;
}

export function assertDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  return url;
}
