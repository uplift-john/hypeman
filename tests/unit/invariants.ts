import { expect } from 'vitest';
import { DEFAULT_RATE_LIMIT } from '../../shared/rateLimiter';

const W = DEFAULT_RATE_LIMIT.windowMs;
const GAP = DEFAULT_RATE_LIMIT.minGapMs;

/** The two invariants, checked over a list of comment times. */
export function assertSpacing(times: number[]) {
  const t = [...times].sort((a, b) => a - b);
  for (let i = 1; i < t.length; i++) {
    expect(t[i] - t[i - 1], `gap between comment ${i - 1} and ${i}`).toBeGreaterThanOrEqual(GAP);
  }
  for (let i = 2; i < t.length; i++) {
    // Any 3 comments must span strictly more than 600 s ⇒ no closed 600 s window holds 3.
    expect(t[i] - t[i - 2], `comments ${i - 2}..${i} fit in one 600s window`).toBeGreaterThan(W);
  }
}

/** Brute-force check: slide a 600 s window across every comment start. */
export function maxInAnyWindow(times: number[]): number {
  let max = 0;
  for (const start of times) max = Math.max(max, times.filter((x) => x >= start && x <= start + W).length);
  return max;
}
