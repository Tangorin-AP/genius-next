const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW = 60_000;

type Bucket = {
  count: number;
  expiresAt: number;
};

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW,
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function remainingMs(key: string): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return Math.max(0, bucket.expiresAt - now);
}
