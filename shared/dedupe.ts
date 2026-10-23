/**
 * Near-duplicate detection for hype lines.
 * Lines are normalised (case, punctuation, a few filler words) and compared by
 * token-set Jaccard similarity plus an exact check on the normalised form.
 */

export const MEMORY_SIZE = 20;
export const NEAR_DUPLICATE_THRESHOLD = 0.6;

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'that', 'this', 'is', 'it', 'you', 'your', 'are', 're', 'just', 'so', 'in', 'on', 'with', 'for']);

export function normalise(line: string): string {
  return line
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(line: string): Set<string> {
  return new Set(
    normalise(line)
      .split(' ')
      .filter((t) => t && !STOP.has(t)),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function isNearDuplicate(line: string, recent: readonly string[], threshold = NEAR_DUPLICATE_THRESHOLD): boolean {
  const n = normalise(line);
  return recent.some((r) => normalise(r) === n || similarity(line, r) >= threshold);
}

/** Append to a bounded memory (most recent last). */
export function remember(memory: readonly string[], line: string, size = MEMORY_SIZE): string[] {
  return [...memory, line].slice(-size);
}
