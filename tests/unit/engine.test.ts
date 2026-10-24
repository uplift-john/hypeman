import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ApiError, CaptureError } from '../../src/session/engine';
import { assertSpacing } from './invariants';
import { MIN, makeHarness, seeded, speakOk, uniqueLine } from './harness';

const HOUR = 60 * MIN;

describe('SessionEngine — lifecycle', () => {
  it('starts listening and schedules a quick, randomised first comment (45–120 s)', async () => {
    const h = makeHarness();
    await h.engine.start();
    expect(h.engine.getState().status).toBe('listening');
    const at = h.engine.nextAttemptAt!;
    expect(at).toBeGreaterThanOrEqual(45_000);
    expect(at).toBeLessThanOrEqual(120_000);
    expect(h.calls).toHaveLength(0); // nothing is sent at start
  });

  it('delivers an automatic comment when the timer fires and the user is active', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.time.advance(2 * MIN);
    expect(h.spoken.length).toBe(1);
    expect(h.engine.getState().lastLook).toMatchObject({ outcome: 'spoke' });
    expect(h.engine.getState().feed[0].line).toBe(h.items[0].line);
    expect(h.engine.getState().usedInWindow).toBe(1);
  });

  it('sends a frame only at the moment it is about to comment — never while sampling', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.time.advance(2 * HOUR);
    expect(h.capture.thumbs).toBeGreaterThan(300); // sampled ~every 20 s
    expect(h.capture.frames).toBe(h.calls.length); // exactly one frame per model request
    expect(h.calls.every((c) => c.image?.startsWith('data:image/jpeg'))).toBe(true);
  });

  it('does not grab or send frames at all when sendFrame is false (mock mode)', async () => {
    const h = makeHarness({ settings: { sendFrame: false } });
    await h.engine.start();
    await h.time.advance(HOUR);
    expect(h.calls.length).toBeGreaterThan(0);
    expect(h.capture.frames).toBe(0);
    expect(h.calls.every((c) => c.image === undefined)).toBe(true);
  });

  it('Stop ends the session instantly: capture stopped, timers cleared, no more calls', async () => {
    const h = makeHarness();
    await h.engine.start();
    h.engine.stop();
    expect(h.capture.stopped).toBe(true);
    expect(h.engine.getState()).toMatchObject({ phase: 'ended', endReason: 'stopped', status: 'ended' });
    expect(h.time.pending()).toBe(0);
    await h.time.advance(3 * HOUR);
    expect(h.calls).toHaveLength(0);
  });

  it('handles the share being revoked mid-session', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.time.advance(5 * MIN);
    h.capture.revoke();
    expect(h.engine.getState()).toMatchObject({ phase: 'ended', endReason: 'share-ended' });
    expect(h.time.pending()).toBe(0);
    const before = h.calls.length;
    await h.time.advance(HOUR);
    expect(h.calls.length).toBe(before);
    expect((await h.engine.hypeNow()).kind).toBe('unavailable');
  });

  it('share revoked while a request is in flight: the late result is dropped', async () => {
    const h = makeHarness();
    let resolve!: (v: { speak: boolean; line: string; reason: string; mode: 'mock' }) => void;
    h.setResponder(() => new Promise((r) => (resolve = r)));
    await h.engine.start();
    const p = h.engine.hypeNow();
    await h.time.advance(1000);
    h.capture.revoke();
    resolve({ speak: true, line: 'Late line about Q3 Forecast', reason: 'ok', mode: 'mock' });
    expect((await p).kind).toBe('unavailable');
    expect(h.engine.getState().feed).toHaveLength(0);
    expect(h.engine.limiter.usedInWindow(h.time.now())).toBe(0);
  });

  it.each([
    ['denied', 'denied'],
    ['cancelled', 'cancelled'],
    ['unsupported', 'unsupported'],
  ] as const)('reports permission %s at start without crashing', async (kind, reason) => {
    const h = makeHarness({ startError: new CaptureError(kind, 'nope') });
    await h.engine.start();
    expect(h.engine.getState()).toMatchObject({ phase: 'ended', endReason: reason });
    expect(h.time.pending()).toBe(0);
  });
});

describe('SessionEngine — gates', () => {
  it('idle suppression: no automatic comments while the screen is unchanged for 3+ min', async () => {
    const h = makeHarness();
    await h.engine.start();
    h.capture.active = false;
    await h.time.advance(3 * MIN + 30_000);
    expect(h.engine.getState().status).toBe('idle');
    const before = h.calls.length; // the quick first look may land before idle kicks in
    expect(before).toBeLessThanOrEqual(1);
    await h.time.advance(3 * HOUR);
    expect(h.calls).toHaveLength(before);
    // Back to work → a comment comes within a few minutes, not instantly.
    h.capture.active = true;
    await h.time.advance(30_000);
    expect(h.engine.getState().status).toBe('listening');
    await h.time.advance(3 * MIN);
    // Back at it → one comment within a couple of minutes (5–120 s jitter), not a burst.
    expect(h.calls.length).toBe(before + 1);
  });

  it('Pause stops sampling and commenting; Resume never fires immediately', async () => {
    const h = makeHarness();
    await h.engine.start();
    h.engine.pause();
    const thumbs = h.capture.thumbs;
    await h.time.advance(2 * HOUR);
    expect(h.calls).toHaveLength(0);
    expect(h.capture.thumbs).toBe(thumbs);
    expect((await h.engine.hypeNow()).kind).toBe('unavailable');
    h.engine.resume();
    await h.time.advance(2 * MIN);
    expect(h.calls).toHaveLength(0);
  });

  it('rapid pause/resume toggling cannot trigger a comment burst', async () => {
    const h = makeHarness({ settings: { frequency: 'max' } });
    await h.engine.start();
    for (let i = 0; i < 400; i++) {
      if (i % 2) h.engine.resume();
      else h.engine.pause();
      await h.time.advance(1500);
    }
    h.engine.resume();
    // 10 minutes of toggling every 1.5 s: each resume re-draws a 2.5+ min delay, so nothing fires.
    expect(h.calls).toHaveLength(0);
    await h.time.advance(HOUR);
    assertSpacing(h.spoken);
  });

  it('Snooze silences automatic comments for the chosen time; manual still works', async () => {
    const h = makeHarness();
    await h.engine.start();
    h.engine.snooze(30);
    expect(h.engine.getState().status).toBe('snoozed');
    await h.time.advance(29 * MIN);
    expect(h.calls).toHaveLength(0);
    const r = await h.engine.hypeNow();
    expect(r.kind).toBe('spoke');
    await h.time.advance(MIN);
    expect(h.engine.getState().status).not.toBe('snoozed');
    await h.time.advance(15 * MIN);
    expect(h.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('quiet hours: no automatic comments inside the window', async () => {
    const h = makeHarness({ settings: { quietHours: { enabled: true, start: '09:00', end: '17:00' } } });
    await h.engine.start(); // wall clock starts at 10:00
    expect(h.engine.getState().status).toBe('quiet');
    await h.time.advance(6 * HOUR + 55 * MIN); // until 16:55
    expect(h.calls).toHaveLength(0);
    await h.time.advance(30 * MIN);
    expect(h.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('a wall-clock jump into quiet hours is respected; a jump out resumes', async () => {
    const h = makeHarness({ settings: { quietHours: { enabled: true, start: '22:00', end: '08:00' } } });
    await h.engine.start();
    h.time.wallSkew = 13 * HOUR; // 23:00
    await h.time.advance(2 * HOUR);
    expect(h.calls).toHaveLength(0);
    h.time.wallSkew = 0;
    await h.time.advance(20 * MIN);
    expect(h.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SessionEngine — Hype me now', () => {
  it('comments immediately and counts toward the limit', async () => {
    const h = makeHarness();
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    expect(h.engine.getState().usedInWindow).toBe(1);
  });

  it('shows a countdown when the limit is hit', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.engine.hypeNow();
    await h.time.advance(95_000);
    await h.engine.hypeNow();
    const r = await h.engine.hypeNow();
    expect(r.kind).toBe('limited');
    const s = h.engine.getState();
    expect(s.limitReason).toBe('window');
    expect(s.limitedUntil! - h.time.now()).toBeGreaterThan(8 * MIN);
  });

  it('button spam (many concurrent presses) yields one request and ≤ 2 comments per window', async () => {
    const h = makeHarness();
    await h.engine.start();
    const results = await Promise.all(Array.from({ length: 50 }, () => h.engine.hypeNow()));
    expect(h.calls).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'spoke')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'busy')).toHaveLength(49);
    for (let i = 0; i < 600; i++) {
      await h.engine.hypeNow();
      await h.time.advance(1000);
    }
    assertSpacing(h.spoken);
  });

  it('works while idle (the user is clearly present)', async () => {
    const h = makeHarness();
    await h.engine.start();
    h.capture.active = false;
    await h.time.advance(5 * MIN);
    expect(h.engine.getState().status).toBe('idle');
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
  });

  it('passes trigger, persona, hint and the recent-line memory to the server', async () => {
    const h = makeHarness({ settings: { persona: 'coach' } });
    await h.engine.start();
    await h.engine.hypeNow();
    await h.time.advance(95_000);
    await h.engine.hypeNow();
    const last = h.calls.at(-1)!;
    expect(last).toMatchObject({ trigger: 'manual', persona: 'coach', hint: 'Q3 Forecast - Google Sheets' });
    expect(last.recent).toEqual([h.items[0].line]);
  });
});

describe('SessionEngine — silence, duplicates and errors', () => {
  it('model silence releases the slot and retries later', async () => {
    const h = makeHarness({ responder: () => ({ speak: false, line: '', reason: 'sensitive', mode: 'real' }) });
    await h.engine.start();
    const r = await h.engine.hypeNow();
    expect(r).toEqual({ kind: 'silent', reason: 'sensitive' });
    expect(h.engine.getState().usedInWindow).toBe(0);
    expect(h.engine.getState().feed).toHaveLength(0);
  });

  it('drops a near-duplicate line even if the server lets it through', async () => {
    const h = makeHarness({ responder: () => ({ speak: true, line: 'Q3 Forecast is looking rock solid today.', reason: 'ok', mode: 'real' }) });
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    await h.time.advance(2 * MIN);
    const r = await h.engine.hypeNow();
    expect(r).toEqual({ kind: 'silent', reason: 'duplicate' });
    expect(h.engine.getState().feed).toHaveLength(1);
  });

  it('never repeats a line across a long session (memory of last 20)', async () => {
    const h = makeHarness({ settings: { frequency: 'max' } });
    const pool = ['Alpha plan looks crisp', 'Bravo deck flows well', 'Charlie sheet totals tidy', 'Delta draft reads clean'];
    h.setResponder((_req, i) => ({ speak: true, line: pool[i % pool.length], reason: 'ok', mode: 'mock' }));
    await h.engine.start();
    await h.time.advance(4 * HOUR);
    const lines = h.items.map((i) => i.line);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('API errors back off exponentially instead of spamming, and show one notice', async () => {
    const h = makeHarness({
      responder: () => {
        throw new ApiError(502, 'The Anthropic API returned an error (500).');
      },
    });
    await h.engine.start();
    await h.time.advance(3 * HOUR);
    // 4–11 min first attempt, then 2, 4, 8, 16, 30, 30… min backoff
    expect(h.calls.length).toBeGreaterThanOrEqual(3);
    expect(h.calls.length).toBeLessThanOrEqual(10);
    const s = h.engine.getState();
    expect(s.notice?.kind).toBe('error');
    expect(s.usedInWindow).toBe(0);
    expect(s.status).toBe('listening');
  });

  it('recovers after errors and clears the notice on success', async () => {
    let fail = true;
    const h = makeHarness({
      responder: () => {
        if (fail) throw new ApiError(0, 'Can’t reach the Hypeman server.');
        return speakOk({} as never, 0);
      },
    });
    await h.engine.start();
    await h.time.advance(30 * MIN);
    expect(h.engine.getState().notice).not.toBeNull();
    fail = false;
    await h.time.advance(HOUR);
    expect(h.spoken.length).toBeGreaterThan(0);
    expect(h.engine.getState().notice).toBeNull();
  });

  it('stop during an in-flight request drops the result and frees the slot', async () => {
    const h = makeHarness();
    let resolve!: (v: { speak: boolean; line: string; reason: string; mode: 'mock' }) => void;
    h.setResponder(() => new Promise((r) => (resolve = r)));
    await h.engine.start();
    const p = h.engine.hypeNow();
    await h.time.advance(100);
    h.engine.stop();
    resolve({ speak: true, line: uniqueLine(), reason: 'ok', mode: 'mock' });
    expect((await p).kind).toBe('unavailable');
    expect(h.engine.getState().feed).toHaveLength(0);
  });
});

describe('SessionEngine — rate limit survives reloads and clock jumps', () => {
  it('seeded with 2 recent deliveries (page reload), it refuses to comment', async () => {
    const h = makeHarness({ seedAges: [60_000, 200_000] });
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('limited');
    expect(h.engine.getState().usedInWindow).toBe(2);
  });

  it('monotonic clock jumping backwards cannot open extra slots', async () => {
    const h = makeHarness();
    await h.engine.start();
    await h.engine.hypeNow();
    await h.time.advance(95_000);
    await h.engine.hypeNow();
    h.time.skew -= 2 * HOUR;
    for (let i = 0; i < 20; i++) {
      expect((await h.engine.hypeNow()).kind).toBe('limited');
      await h.time.advance(20_000);
    }
  });
});

/* ───────────── property: simulated 8-hour sessions through the real engine ───────────── */

type Act =
  | { k: 'work'; ms: number }
  | { k: 'idle'; ms: number }
  | { k: 'spam'; n: number }
  | { k: 'pauseResume'; ms: number }
  | { k: 'snooze'; m: number }
  | { k: 'silent' }
  | { k: 'clockBack'; ms: number }
  | { k: 'sleep'; ms: number }
  | { k: 'freq'; f: 'chill' | 'normal' | 'max' };

const act: fc.Arbitrary<Act> = fc.oneof(
  { weight: 8, arbitrary: fc.record({ k: fc.constant('work' as const), ms: fc.integer({ min: 10_000, max: 40 * MIN }) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('idle' as const), ms: fc.integer({ min: MIN, max: 30 * MIN }) }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('spam' as const), n: fc.integer({ min: 1, max: 30 }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('pauseResume' as const), ms: fc.integer({ min: 0, max: 10 * MIN }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('snooze' as const), m: fc.constantFrom(15, 30, 60) }) },
  { weight: 1, arbitrary: fc.constant({ k: 'silent' as const }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('clockBack' as const), ms: fc.integer({ min: 1, max: HOUR }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('sleep' as const), ms: fc.integer({ min: 0, max: HOUR }) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('freq' as const), f: fc.constantFrom('chill' as const, 'normal' as const, 'max' as const) }) },
);

describe('SessionEngine — property: 8-hour sessions never break the 2-per-10 rule', () => {
  it('holds with randomized activity, Hype-me-now spam, pauses, snoozes, silence, clock jumps and sleep', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(act, { minLength: 20, maxLength: 120 }), fc.integer({ min: 1, max: 1e9 }), async (acts, seed) => {
        const h = makeHarness({ seed });
        let silentNext = 0;
        h.setResponder(() => (silentNext-- > 0 ? { speak: false, line: '', reason: 'nothing-notable', mode: 'mock' } : { speak: true, line: uniqueLine(), reason: 'ok', mode: 'mock' }));
        await h.engine.start();
        const END = 8 * HOUR;
        for (const a of acts) {
          if (h.time.t >= END) break;
          switch (a.k) {
            case 'work':
              h.capture.active = true;
              await h.time.advance(a.ms);
              break;
            case 'idle':
              h.capture.active = false;
              await h.time.advance(a.ms);
              break;
            case 'spam':
              for (let i = 0; i < a.n; i++) {
                void h.engine.hypeNow();
                await h.time.advance(200);
              }
              break;
            case 'pauseResume':
              h.engine.pause();
              await h.time.advance(a.ms);
              h.engine.resume();
              break;
            case 'snooze':
              h.engine.snooze(a.m);
              break;
            case 'silent':
              silentNext = 2;
              break;
            case 'clockBack':
              h.time.skew -= a.ms;
              break;
            case 'sleep': {
              // Monotonic clock frozen while asleep: true time passes, engine clock doesn't.
              h.time.skew -= a.ms;
              await h.time.advance(a.ms);
              break;
            }
            case 'freq':
              h.engine.updateSettings({ frequency: a.f });
              break;
          }
        }
        if (h.time.t < END) await h.time.advance(END - h.time.t);
        assertSpacing(h.spoken);
        // Brute-force sliding window over the true delivery times.
        for (const start of h.spoken) expect(h.spoken.filter((x) => x >= start && x <= start + 600_000).length).toBeLessThanOrEqual(2);
      }),
      { numRuns: 60 },
    );
  }, 120_000);
});

describe('SessionEngine — cadence', () => {
  it('Normal averages roughly one comment every 6–9 minutes while active', async () => {
    const gaps: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const h = makeHarness({ seed });
      await h.engine.start();
      await h.time.advance(8 * HOUR);
      for (let i = 1; i < h.spoken.length; i++) gaps.push(h.spoken[i] - h.spoken[i - 1]);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length / MIN;
    expect(mean).toBeGreaterThanOrEqual(6);
    expect(mean).toBeLessThanOrEqual(9);
  });

  it('timing is not predictable: gaps vary widely', async () => {
    const h = makeHarness({ seed: 7 });
    await h.engine.start();
    await h.time.advance(8 * HOUR);
    const gaps = h.spoken.slice(1).map((t, i) => t - h.spoken[i]);
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    expect(max - min).toBeGreaterThan(4 * MIN);
    expect(new Set(gaps.map((g) => Math.round(g / 1000))).size).toBeGreaterThan(gaps.length * 0.8);
  });

  it('Max can never exceed the 2-per-10 rule', async () => {
    const h = makeHarness({ seed: 3, settings: { frequency: 'max' } });
    await h.engine.start();
    await h.time.advance(8 * HOUR);
    assertSpacing(h.spoken);
    expect(h.spoken.length).toBeLessThanOrEqual(8 * 6 * 2);
  });

  it('seeded rng helper is deterministic', () => {
    expect(seeded(5)()).toBe(seeded(5)());
  });
});
