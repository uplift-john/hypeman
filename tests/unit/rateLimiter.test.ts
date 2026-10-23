import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMIT, RateLimiter } from '../../shared/rateLimiter';
import { assertSpacing, maxInAnyWindow } from './invariants';

const MIN = 60_000;
const W = DEFAULT_RATE_LIMIT.windowMs;
const GAP = DEFAULT_RATE_LIMIT.minGapMs;

describe('RateLimiter — basics', () => {
  it('allows the first comment', () => {
    const rl = new RateLimiter();
    expect(rl.check(0).ok).toBe(true);
  });

  it('enforces the 90 s minimum gap', () => {
    const rl = new RateLimiter();
    expect(rl.tryAcquire(0).ok).toBe(true);
    const d = rl.check(GAP - 1);
    expect(d).toMatchObject({ ok: false, reason: 'gap', retryAt: GAP });
    expect(rl.check(GAP).ok).toBe(true);
  });

  it('allows exactly 2 per rolling 10 minutes', () => {
    const rl = new RateLimiter();
    expect(rl.tryAcquire(0).ok).toBe(true);
    expect(rl.tryAcquire(GAP).ok).toBe(true);
    const d = rl.check(5 * MIN);
    expect(d).toMatchObject({ ok: false, reason: 'window', usedInWindow: 2 });
    if (!d.ok) expect(d.retryAt).toBe(W + 1);
    // exactly 600 s after the first is still blocked (closed window)…
    expect(rl.check(W).ok).toBe(false);
    // …and 1 ms later the slot opens.
    expect(rl.check(W + 1).ok).toBe(true);
  });

  it('is rolling, not fixed-bucket: a third comment waits for the *oldest* to age out', () => {
    const rl = new RateLimiter();
    rl.tryAcquire(9 * MIN); // late in "bucket 1"
    rl.tryAcquire(10.5 * MIN); // early in "bucket 2"
    // A fixed 10-min bucket would allow another at 11 min. Rolling must not.
    expect(rl.check(11 * MIN).ok).toBe(false);
    expect(rl.check(19 * MIN).ok).toBe(false);
    expect(rl.check(19 * MIN + 1).ok).toBe(true);
  });

  it('retryAt is always a time at which check() succeeds', () => {
    const rl = new RateLimiter();
    rl.tryAcquire(0);
    rl.tryAcquire(2 * MIN);
    const d = rl.check(3 * MIN);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(rl.check(d.retryAt - 1).ok).toBe(false);
      expect(rl.check(d.retryAt).ok).toBe(true);
    }
  });

  it('release() gives a slot back (model declined / network error)', () => {
    const rl = new RateLimiter();
    const a = rl.tryAcquire(0);
    expect(a.ok).toBe(true);
    rl.release(a.token!);
    expect(rl.check(1).ok).toBe(true);
    expect(rl.usedInWindow(1)).toBe(0);
  });

  it('tryAcquire is atomic: hammering at one instant takes exactly one slot', () => {
    const rl = new RateLimiter();
    const results = Array.from({ length: 1000 }, () => rl.tryAcquire(42));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('hammering "Hype me now" every second for an hour never exceeds the rule', () => {
    const rl = new RateLimiter();
    const spoke: number[] = [];
    for (let t = 0; t <= 60 * MIN; t += 1000) if (rl.tryAcquire(t).ok) spoke.push(t);
    assertSpacing(spoke);
    expect(maxInAnyWindow(spoke)).toBeLessThanOrEqual(2);
    // and it does keep working: ~12 comments in an hour (2 per 10 min)
    expect(spoke.length).toBeGreaterThanOrEqual(10);
  });

  it('clock jumping backwards never reopens a slot early', () => {
    const rl = new RateLimiter();
    rl.tryAcquire(100 * MIN);
    rl.tryAcquire(102 * MIN);
    // clock jumps back an hour
    expect(rl.check(40 * MIN).ok).toBe(false);
    expect(rl.tryAcquire(45 * MIN).ok).toBe(false);
    // limiter reasons from the high-water mark, so the slot opens 600 s after the first comment in *its* frame
    expect(rl.check(110 * MIN).ok).toBe(false);
    expect(rl.check(110 * MIN + 1).ok).toBe(true);
  });

  it('clock jumping backwards after a comment cannot be used to stack comments', () => {
    const rl = new RateLimiter();
    const spoke: number[] = [];
    let wall = 0;
    for (let i = 0; i < 500; i++) {
      wall += i % 7 === 0 ? -5 * MIN : 30_000; // repeatedly jump back 5 min
      if (rl.tryAcquire(wall).ok) spoke.push(Math.max(...[wall, ...spoke]));
    }
    assertSpacing(rl.history() as number[]);
  });

  it('seed() restores recent comments after a reload', () => {
    const rl = new RateLimiter();
    rl.seed(1_000_000, [30_000, 200_000]);
    expect(rl.check(1_000_000)).toMatchObject({ ok: false, reason: 'window' });
    // oldest seeded was 200 s ago → opens 400 s (+1 ms) from now
    const d = rl.check(1_000_000);
    if (!d.ok) expect(d.retryAt).toBe(1_000_000 - 200_000 + W + 1);
  });

  it('seed() treats negative / NaN ages (wall clock moved back) as "just now"', () => {
    const rl = new RateLimiter();
    rl.seed(5_000_000, [-60_000, Number.NaN]);
    expect(rl.check(5_000_000).ok).toBe(false);
  });

  it('rejects non-finite times instead of silently misbehaving', () => {
    const rl = new RateLimiter();
    expect(() => rl.check(Number.NaN)).toThrow();
    expect(() => rl.check(Infinity)).toThrow();
  });

  it('rejects nonsensical configs', () => {
    expect(() => new RateLimiter({ maxInWindow: 0 })).toThrow();
    expect(() => new RateLimiter({ windowMs: 0 })).toThrow();
  });
});

/* ───────────── property-based: random 8-hour sessions ───────────── */

type Cmd =
  | { kind: 'wait'; ms: number } // true time passes, clock follows
  | { kind: 'attempt' } // scheduler tick or "Hype me now"
  | { kind: 'spam'; n: number } // burst of button presses
  | { kind: 'decline' } // last acquired slot was not used (model silent)
  | { kind: 'clockBack'; ms: number } // clock jumps backwards (true time unaffected)
  | { kind: 'sleep'; ms: number }; // machine sleeps: true time passes, monotonic clock frozen

const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('wait' as const), ms: fc.integer({ min: 0, max: 15 * MIN }) }) },
  { weight: 4, arbitrary: fc.constant({ kind: 'attempt' as const }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('spam' as const), n: fc.integer({ min: 1, max: 40 }) }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'decline' as const }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('clockBack' as const), ms: fc.integer({ min: 1, max: 3 * 60 * MIN }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('sleep' as const), ms: fc.integer({ min: 0, max: 2 * 60 * MIN }) }) },
);

function run(cmds: Cmd[]) {
  const rl = new RateLimiter();
  let trueTime = 0;
  let clock = 1_000_000_000; // what the limiter sees
  const delivered: Array<{ token: number; trueAt: number }> = [];
  const EIGHT_HOURS = 8 * 60 * MIN;

  for (const c of cmds) {
    if (trueTime > EIGHT_HOURS) break;
    switch (c.kind) {
      case 'wait':
        trueTime += c.ms;
        clock += c.ms;
        break;
      case 'sleep':
        trueTime += c.ms; // monotonic clock may not advance during sleep — only makes us more conservative
        break;
      case 'clockBack':
        clock -= c.ms;
        break;
      case 'attempt':
      case 'spam': {
        const n = c.kind === 'spam' ? c.n : 1;
        for (let i = 0; i < n; i++) {
          const r = rl.tryAcquire(clock);
          if (r.ok) delivered.push({ token: r.token!, trueAt: trueTime });
          trueTime += 50;
          clock += 50;
        }
        break;
      }
      case 'decline': {
        const last = delivered.pop();
        if (last) rl.release(last.token);
        break;
      }
    }
  }
  return { rl, delivered };
}

describe('RateLimiter — property: no 600 s window ever holds more than 2 comments', () => {
  it('holds in the limiter’s own time frame, across random 8-hour sessions with spam, declines, clock jumps and sleep', () => {
    fc.assert(
      fc.property(fc.array(cmd, { minLength: 50, maxLength: 600 }), (cmds) => {
        const { rl, delivered } = run(cmds);
        const effective = delivered.map((d) => d.token);
        assertSpacing(effective);
        expect(maxInAnyWindow(effective)).toBeLessThanOrEqual(2);
        expect(rl.history().length).toBeLessThanOrEqual(3);
      }),
      { numRuns: 400 },
    );
  });

  it('holds in true (real-world) time too, because the clock can only lag reality', () => {
    fc.assert(
      fc.property(fc.array(cmd, { minLength: 50, maxLength: 600 }), (cmds) => {
        const { delivered } = run(cmds);
        const trueTimes = delivered.map((d) => d.trueAt);
        assertSpacing(trueTimes);
        expect(maxInAnyWindow(trueTimes)).toBeLessThanOrEqual(2);
      }),
      { numRuns: 400 },
    );
  });

  it('a slot always opens eventually (the limiter never deadlocks)', () => {
    fc.assert(
      fc.property(fc.array(cmd, { minLength: 1, maxLength: 200 }), (cmds) => {
        const { rl } = run(cmds);
        const d = rl.check(4_000_000_000_000);
        expect(d.ok).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
