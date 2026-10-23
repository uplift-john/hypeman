/**
 * Randomised timing. Pure: callers inject the random source.
 *
 * Delays are drawn uniformly from [min, max] so there is no predictable cadence.
 * The rate limiter is still the final authority — even "Max" can never beat 2 per 10 min.
 */

export type Frequency = 'chill' | 'normal' | 'max';

export interface DelayRange {
  minMs: number;
  maxMs: number;
}

const MIN = 60_000;

export const FREQUENCY_DELAYS: Record<Frequency, DelayRange> = {
  // mean ≈ 13 min
  chill: { minMs: 8 * MIN, maxMs: 18 * MIN },
  // mean ≈ 7.5 min — the spec's "roughly 1 every 6–9 minutes when active"
  normal: { minMs: 4 * MIN, maxMs: 11 * MIN },
  // mean ≈ 4.5 min, but the limiter caps it at 2 per rolling 10 min anyway
  max: { minMs: 2.5 * MIN, maxMs: 6.5 * MIN },
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  chill: 'Chill',
  normal: 'Normal',
  max: 'Max',
};

export const IDLE_AFTER_MS = 3 * MIN;
export const SAMPLE_EVERY_MS = 20_000;

export type Rng = () => number;

export function randomBetween(rng: Rng, minMs: number, maxMs: number): number {
  const r = Math.min(Math.max(rng(), 0), 0.999999);
  return Math.round(minMs + r * (maxMs - minMs));
}

export function nextDelay(freq: Frequency, rng: Rng): number {
  const { minMs, maxMs } = FREQUENCY_DELAYS[freq];
  return randomBetween(rng, minMs, maxMs);
}

/** Short random wait used after the limiter/idle gate blocks, so we don't fire exactly on the boundary. */
export function jitter(rng: Rng, maxMs = 60_000): number {
  return randomBetween(rng, 5_000, maxMs);
}

/** After the model declines (nothing worth saying / sensitive), wait a bit before looking again. */
export function retryAfterSilence(rng: Rng): number {
  return randomBetween(rng, 2 * MIN, 4 * MIN);
}

/** Exponential backoff for API errors — capped so a broken key never spams. */
export function errorBackoff(attempt: number, rng: Rng): number {
  const base = Math.min(2 * MIN * 2 ** Math.max(0, attempt - 1), 30 * MIN);
  return base + randomBetween(rng, 0, 30_000);
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" 24h local */
  start: string;
  end: string;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True if local time `date` falls inside quiet hours. Handles windows that wrap past midnight. */
export function inQuietHours(q: QuietHours, date: Date): boolean {
  if (!q.enabled) return false;
  const s = toMinutes(q.start);
  const e = toMinutes(q.end);
  if (s === null || e === null || s === e) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
}
