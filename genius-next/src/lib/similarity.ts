
/**
 * Clean-room similarity that mirrors Genius semantics:
 * - Return 1.0 if equal ignoring case/spacing/punctuation (auto-right)
 * - Otherwise return a normalized similarity in [0,1]
 *   (character trigram cosine)
 */
export function normalizeForExact(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}

export function isExactLike(a: string, b: string): boolean {
  if (a === b) return true;
  return normalizeForExact(a) === normalizeForExact(b);
}

export function trigramCosine(a: string, b: string): number {
  const grams = (s: string) => {
    const t = '  ' + s.toLowerCase() + ' ';
    const g = new Map<string, number>();
    for (let i=0;i<t.length-2;i++) {
      const k = t.slice(i,i+3);
      g.set(k, (g.get(k)||0)+1);
    }
    return g;
  };
  const A = grams(a), B = grams(b);
  let dot = 0, na = 0, nb = 0;
  for (const [k,va] of A) { na += va*va; const vb = B.get(k); if (vb) dot += va*vb; }
  for (const [,vb] of B) nb += vb*vb;
  if (!na || !nb) return (a.trim()===b.trim()) ? 1 : 0;
  return dot / Math.sqrt(na*nb);
}
