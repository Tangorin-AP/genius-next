import { normalizeForExact, trigramCosine } from './similarity';

class SearchKitVectorIndex {
  private vector: Map<string, number> = new Map();

  private norm = 0;

  async addDocument(id: string, text: string) {
    const grams = this.buildVector(text);
    this.vector = grams;
    this.norm = this.length(grams);
    return id;
  }

  async score(text: string): Promise<number> {
    if (this.vector.size === 0 || this.norm === 0) return 0;
    const grams = this.buildVector(text);
    const norm = this.length(grams);
    if (norm === 0) return 0;
    let dot = 0;
    for (const [token, weight] of grams) {
      const other = this.vector.get(token);
      if (other) dot += weight * other;
    }
    return dot / (norm * this.norm);
  }

  private buildVector(text: string): Map<string, number> {
    const grams = new Map<string, number>();
    const padded = `  ${text.toLowerCase()} `;
    for (let i = 0; i < padded.length - 2; i += 1) {
      const token = padded.slice(i, i + 3);
      grams.set(token, (grams.get(token) ?? 0) + 1);
    }
    return grams;
  }

  private length(vec: Map<string, number>): number {
    let sum = 0;
    for (const value of vec.values()) {
      sum += value * value;
    }
    return Math.sqrt(sum);
  }
}

export type MatchingMode = 'exact' | 'case' | 'fuzzy';

export async function computeCorrectness(expected: string, received: string, mode: MatchingMode): Promise<number> {
  if (mode === 'exact') {
    return expected === received ? 1 : 0;
  }

  if (mode === 'case') {
    return expected.localeCompare(received, undefined, { sensitivity: 'accent' }) === 0 ? 1 : 0;
  }

  if (!expected.trim() && !received.trim()) return 1;
  try {
    const index = new SearchKitVectorIndex();
    await index.addDocument('target', expected);
    const targetScore = await index.score(expected);
    const inputScore = await index.score(received);
    if (!Number.isFinite(targetScore) || targetScore <= 0) {
      const fallback = trigramCosine(expected, received);
      return Math.max(0, Math.min(1, fallback));
    }
    const ratio = inputScore / targetScore;
    if (!Number.isFinite(ratio) || ratio < 0) return 0;
    return Math.max(0, Math.min(1, ratio));
  } catch {
    const fallback = trigramCosine(expected, received);
    return Math.max(0, Math.min(1, fallback));
  }
}

export function defaultMatchingMode(): MatchingMode {
  return 'fuzzy';
}

export function normalizeAnswerDisplay(input: string): string {
  const normalized = normalizeForExact(input);
  return normalized === '' ? '—' : normalized;
}
