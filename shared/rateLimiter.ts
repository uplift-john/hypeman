/**
 * Hypeman's hard speaking rule, as a pure module.
 *
 *  - Never more than `maxInWindow` comments in any rolling `windowMs` window.
 *  - At least `minGapMs` between any two comments.
 *
 * The limiter never reads a clock itself: every call takes `now` from the caller
 * (production passes a monotonic clock). If time ever appears to run backwards
 * (clock jump, sleep/wake quirks), recorded timestamps are clamped so that the
 * limiter only ever becomes *more* conservative, never less.
 */

export interface RateLimitConfig {
  windowMs: number;
  maxInWindow: number;
  minGapMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = Object.freeze({
  windowMs: 600_000,
  maxInWindow: 2,
  minGapMs: 90_000,
});

export type LimitReason = 'window' | 'gap';

export type LimitDecision =
  | { ok: true; usedInWindow: number }
  | { ok: false; reason: LimitReason; retryAt: number; usedInWindow: number };

export class RateLimiter {
  private readonly cfg: RateLimitConfig;
  /** Effective (clamped, non-decreasing) timestamps of delivered/reserved comments. */
  private stamps: number[] = [];
  /** Highest `now` ever observed — used to detect clocks running backwards. */
  private highWater = -Infinity;

  constructor(cfg: Partial<RateLimitConfig> = {}) {
    this.cfg = { ...DEFAULT_RATE_LIMIT, ...cfg };
    if (this.cfg.maxInWindow < 1) throw new Error('maxInWindow must be ≥ 1');
    if (this.cfg.windowMs <= 0 || this.cfg.minGapMs < 0) throw new Error('invalid window/gap');
  }

  get config(): RateLimitConfig {
    return this.cfg;
  }

  /**
   * Translate a caller-supplied time into the limiter's effective time.
   * If the clock went backwards we keep reasoning from the high-water mark, so an
   * earlier comment can never "fall out" of the window early.
   */
  private effective(now: number): number {
    if (!Number.isFinite(now)) throw new Error('now must be finite');
    if (now > this.highWater) this.highWater = now;
    return this.highWater;
  }

  private prune(t: number): void {
    // Keep anything that could still matter for either rule.
    this.stamps = this.stamps.filter((s) => this.inWindow(s, t) || t - s < this.cfg.minGapMs);
  }

  check(now: number): LimitDecision {
    const t = this.effective(now);
    this.prune(t);
    const inWindow = this.stamps.filter((s) => this.inWindow(s, t));
    const used = inWindow.length;

    if (used >= this.cfg.maxInWindow) {
      // The slot opens when the oldest stamp that keeps us at the cap expires.
      const blocking = inWindow[used - this.cfg.maxInWindow];
      const retryAt = Math.max(blocking + this.cfg.windowMs + 1, this.gapOpensAt());
      return { ok: false, reason: 'window', retryAt, usedInWindow: used };
    }
    const gapAt = this.gapOpensAt();
    if (t < gapAt) {
      return { ok: false, reason: 'gap', retryAt: gapAt, usedInWindow: used };
    }
    return { ok: true, usedInWindow: used };
  }

  /**
   * Closed window: a stamp exactly `windowMs` ago still counts. So any three
   * comments always span strictly more than `windowMs`.
   */
  private inWindow(stamp: number, t: number): boolean {
    return t - stamp <= this.cfg.windowMs;
  }

  private gapOpensAt(): number {
    const last = this.stamps[this.stamps.length - 1];
    return last === undefined ? -Infinity : last + this.cfg.minGapMs;
  }

  /**
   * Atomically check and record. Returns the decision; on success the slot is
   * taken and a token is returned that can be passed to `release` if the comment
   * ends up not being delivered (model declined, network error…).
   */
  tryAcquire(now: number): LimitDecision & { token?: number } {
    const d = this.check(now);
    if (!d.ok) return d;
    const t = this.effective(now);
    this.stamps.push(t);
    return { ok: true, usedInWindow: d.usedInWindow + 1, token: t };
  }

  /** Give back a slot that was acquired but never used to speak. */
  release(token: number): void {
    const i = this.stamps.lastIndexOf(token);
    if (i !== -1) this.stamps.splice(i, 1);
  }

  /**
   * Seed with comments delivered before this limiter existed (e.g. after a page
   * reload). Ages are "how long ago" in ms; negative/invalid ages count as "just now".
   */
  seed(now: number, agesMs: number[]): void {
    const t = this.effective(now);
    const seeded = agesMs
      .map((a) => (Number.isFinite(a) && a > 0 ? t - a : t))
      .filter((s) => this.inWindow(s, t));
    this.stamps = [...this.stamps, ...seeded].sort((a, b) => a - b);
  }

  usedInWindow(now: number): number {
    return this.check(now).usedInWindow;
  }

  /** Effective timestamps currently retained (for tests/diagnostics). */
  history(): readonly number[] {
    return [...this.stamps];
  }

  reset(): void {
    this.stamps = [];
  }
}
