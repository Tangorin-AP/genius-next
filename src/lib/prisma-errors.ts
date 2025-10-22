export function extractPrismaErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as Record<string, unknown>;

  const code = candidate.code;
  if (typeof code === 'string') {
    return code;
  }

  const nestedSources: readonly unknown[] = [candidate.cause, candidate.err, candidate.original];
  for (const source of nestedSources) {
    const nested = extractPrismaErrorCode(source);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

export function isPrismaSchemaMissingError(error: unknown): boolean {
  return extractPrismaErrorCode(error) === 'P2021';
}
