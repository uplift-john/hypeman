/**
 * QA review, iteration 1 — adversarial tests.
 * Tests that expose real bugs are intentionally left failing (see review/iteration-1/reviews/qa.md).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../shared/rateLimiter';
import type { HypeResponse } from '../../shared/types';
import { ApiError } from '../../src/session/engine';
import { assertSpacing, maxInAnyWindow } from './invariants';
import { MIN, makeHarness, uniqueLine } from './harness';

const HOUR = 60 * MIN;
const ok = (): HypeResponse => ({ speak: true, line: uniqueLine(), reason: 'ok', mode: 'mock' });

/* ───────────────────────── API errors must not spam ───────────────────────── */

describe('adversarial — error backoff', () => {
  it('error backoff is not bypassed when the screen flips idle → active (no request spam during an outage)', async () => {
    const h = makeHarness({
      responder: () => {
        throw new ApiError(502, 'The Anthropic API returned an error (500).');
      },
    });
    await h.engine.start();
    // A user who keeps glancing away: 3.5 min unchanged, then 40 s of activity, over and over.
    const end = h.time.t + 60 * MIN;
    while (h.time.t < end) {
      h.capture.active = false;
      await h.time.advance(3.5 * MIN);
      h.capture.active = true;
      await h.time.advance(40_000);
    }
    // Backoff schedule (first try 4–11 min, then +2, +4, +8, +16, +30 min…) allows at most ~5 calls in an hour.
    // Every idle→active flip currently re-schedules an attempt 5–120 s out, ignoring the backoff.
    expect(h.calls.length).toBeLessThanOrEqual(5);
  });

  it('a hanging API cannot wedge the limiter or produce a burst once it recovers', async () => {
    const pending: Array<(r: HypeResponse) => void> = [];
    const h = makeHarness({ responder: () => new Promise<HypeResponse>((r) => pending.push(r)) });
    await h.engine.start();
    const first = h.engine.hypeNow();
    await h.time.advance(20 * MIN);
    // Only one request ever goes out while one is in flight.
    expect(h.calls).toHaveLength(1);
    expect(h.engine.getState().status).toBe('thinking');
    expect((await h.engine.hypeNow()).kind).toBe('busy');
    pending.forEach((r) => r(ok()));
    expect((await first).kind).toBe('spoke');
    h.setResponder(() => ok());
    // Hammer once a second for 30 minutes after recovery.
    for (let i = 0; i < 1800; i++) {
      await h.engine.hypeNow();
      await h.time.advance(1000);
    }
    assertSpacing(h.spoken);
    expect(maxInAnyWindow(h.spoken)).toBeLessThanOrEqual(2);
  });
});

/* ───────────────────────── latency: the rule is about what the user sees ───────────────────────── */

describe('adversarial — variable API latency', () => {
  it('a slow first reply + fast later replies cannot put 3 comments in 600 s or 2 within 90 s (delivery time)', async () => {
    // Latency per request: first one 34 s (just under the 35 s client timeout), the rest 1 s.
    const latencies = [34_000, 1_000, 1_000, 1_000, 1_000, 1_000];
    let i = 0;
    const h = makeHarness({ settings: { frequency: 'chill' } });
    h.setResponder(
      () =>
        new Promise<HypeResponse>((r) => {
          h.time.timers_.setTimeout(() => r(ok()), latencies[Math.min(i++, latencies.length - 1)]);
        }),
    );
    await h.engine.start();
    // Press "Hype me now" every second for 12 minutes, exactly like an impatient user.
    for (let s = 0; s < 12 * 60; s++) {
      void h.engine.hypeNow();
      await h.time.advance(1000);
    }
    expect(h.spoken.length).toBeGreaterThanOrEqual(2);
    // spoken[] holds the true time each comment actually appeared.
    assertSpacing(h.spoken);
    expect(maxInAnyWindow(h.spoken)).toBeLessThanOrEqual(2);
  });
});

/* ───────────────────────── pause / revoke while a request is in flight ───────────────────────── */

describe('adversarial — in-flight requests', () => {
  it('pause → resume while a request is in flight: the stale request does not leave a ghost slot blocking Hype me now', async () => {
    const pending: Array<(r: HypeResponse) => void> = [];
    const h = makeHarness({ responder: () => new Promise<HypeResponse>((r) => pending.push(r)) });
    await h.engine.start();
    const stale = h.engine.hypeNow();
    await h.time.advance(1000);
    h.engine.pause();
    h.engine.resume();
    // Nothing has been said. The UI must not claim "Hypeman leaves at least 90 seconds between comments".
    const s = h.engine.getState();
    expect(s.usedInWindow).toBe(0);
    expect(s.limitedUntil).toBeNull();
    h.setResponder(() => ok());
    const r = await h.engine.hypeNow();
    expect(r.kind).toBe('spoke');
    pending.forEach((p) => p(ok()));
    expect((await stale).kind).toBe('unavailable');
    expect(h.spoken).toHaveLength(1);
  });

  it('stale in-flight result after pause/resume never produces a second comment inside the gap', async () => {
    const pending: Array<(r: HypeResponse) => void> = [];
    let slow = true;
    const h = makeHarness({ responder: () => (slow ? new Promise<HypeResponse>((r) => pending.push(r)) : ok()) });
    await h.engine.start();
    const stale = h.engine.hypeNow();
    h.engine.pause();
    h.engine.resume();
    slow = false;
    // Hammer while the stale request is still outstanding, then let it resolve mid-hammer.
    for (let i = 0; i < 300; i++) {
      void h.engine.hypeNow();
      if (i === 50) pending.forEach((p) => p(ok()));
      await h.time.advance(1000);
    }
    await stale;
    assertSpacing(h.spoken);
    expect(maxInAnyWindow(h.spoken)).toBeLessThanOrEqual(2);
  });

  it('share revoked mid-request: no comment, no timers; after restart the limiter still remembers earlier comments', async () => {
    const pending: Array<(r: HypeResponse) => void> = [];
    let slow = false;
    const h = makeHarness({ responder: () => (slow ? new Promise<HypeResponse>((r) => pending.push(r)) : ok()) });
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    await h.time.advance(95_000);
    slow = true;
    const p = h.engine.hypeNow();
    h.capture.revoke();
    h.capture.revoke(); // a second "ended" event must be harmless
    pending.forEach((r) => r(ok()));
    expect((await p).kind).toBe('unavailable');
    expect(h.engine.getState()).toMatchObject({ phase: 'ended', endReason: 'share-ended', thinking: false });
    expect(h.time.pending()).toBe(0);
    expect(h.spoken).toHaveLength(1);
    expect((await h.engine.hypeNow()).kind).toBe('unavailable');
    // Start again right away: the earlier comment still counts.
    slow = false;
    h.engine.reset();
    await h.engine.start();
    expect(h.engine.getState().usedInWindow).toBe(1);
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    expect((await h.engine.hypeNow()).kind).toBe('limited');
    await h.time.advance(30 * MIN);
    assertSpacing(h.spoken);
  });
});

/* ───────────────────────── clocks ───────────────────────── */

describe('adversarial — clocks', () => {
  it('monotonic clock frozen during sleep, then wall clock jumps by days: still ≤2 per 600 s in true time', async () => {
    const h = makeHarness({ settings: { frequency: 'max' } });
    await h.engine.start();
    for (let round = 0; round < 20; round++) {
      await h.engine.hypeNow();
      await h.time.advance(30_000);
      // "sleep": true time advances but the monotonic clock does not.
      h.time.skew -= 30_000;
      h.time.wallSkew += (round % 2 ? -1 : 1) * 3 * 24 * HOUR;
      await h.engine.hypeNow();
      await h.time.advance(15_000);
    }
    assertSpacing(h.spoken);
    expect(maxInAnyWindow(h.spoken)).toBeLessThanOrEqual(2);
  });

  it('limiter: release() of a stale token after a backwards clock jump never frees someone else’s slot', () => {
    const l = new RateLimiter();
    const a = l.tryAcquire(1_000_000);
    expect(a.ok).toBe(true);
    // clock jumps back; everything is clamped to the high-water mark
    const b = l.tryAcquire(500_000);
    expect(b.ok).toBe(false);
    l.release(a.token!);
    // Slot really is free now and the next one obeys the gap.
    const c = l.tryAcquire(600_000);
    expect(c.ok).toBe(true);
    expect(l.tryAcquire(600_001).ok).toBe(false);
    expect(l.history()).toHaveLength(1);
  });
});

/* ───────────────────────── reload seeding (localStorage) ───────────────────────── */

describe('adversarial — reload seeding', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => store.clear());

  it('corrupted delivery storage never throws and never unlocks extra comments', async () => {
    const { recentDeliveryAges, recordDelivery } = await import('../../src/lib/storage');
    store.set('hypeman.deliveries.v1', '{not json');
    expect(recentDeliveryAges(Date.now())).toEqual([]);
    store.set('hypeman.deliveries.v1', JSON.stringify(['x', null, {}, 5]));
    expect(() => recordDelivery(1_000_000)).not.toThrow();
    const now = 1_000_000 + 95_000;
    const ages = recentDeliveryAges(now);
    expect(ages).toContain(95_000);
    const h = makeHarness({ seedAges: ages });
    await h.engine.start();
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
    expect((await h.engine.hypeNow()).kind).toBe('limited');
  });

  it('a delivery stamped in the future (wall clock was wrong, then corrected) does not block for more than 10 minutes', async () => {
    const { recentDeliveryAges, recordDelivery } = await import('../../src/lib/storage');
    const realNow = 2_000_000_000_000;
    // Two comments delivered while the system clock was 2 h fast.
    recordDelivery(realNow + 2 * HOUR);
    recordDelivery(realNow + 2 * HOUR + 95_000);
    // Clock corrected (NTP). 15 minutes of real time later the user reloads.
    const ages = recentDeliveryAges(realNow + 15 * MIN);
    const h = makeHarness({ seedAges: ages });
    await h.engine.start();
    // Both comments are >10 min old in real time; the user should not still be locked out.
    expect((await h.engine.hypeNow()).kind).toBe('spoke');
  });
});

/* ───────────────────────── API client timeout ───────────────────────── */

describe('adversarial — API client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a server that never answers is aborted after the client timeout with a friendly ApiError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_: string, init: RequestInit) => {
      return new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      });
    });
    const { api } = await import('../../src/lib/api');
    const p = api.hype({ persona: 'hype', trigger: 'manual', recent: [] });
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(36_000);
    const err = await caught;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/too long/);
  });

  it('a non-JSON 500 page becomes a clean ApiError (no crash on HTML bodies)', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const { api } = await import('../../src/lib/api');
    await expect(api.hype({ persona: 'hype', trigger: 'auto', recent: [] })).rejects.toMatchObject({ status: 502, message: 'Server error (502).' });
  });
});

/* ───────────────────────── mock mode with no .env (real process) ───────────────────────── */

describe('adversarial — mock mode boots with no .env and no key', () => {
  const PORT = 8931;
  let proc: ChildProcess | null = null;
  let log = '';

  beforeAll(async () => {
    const root = resolve(__dirname, '../..');
    const cwd = mkdtempSync(join(tmpdir(), 'hypeman-noenv-')); // guaranteed: no .env here
    const env: NodeJS.ProcessEnv = { ...process.env, HYPEMAN_API_PORT: String(PORT), HYPEMAN_WEB_PORT: '5399' };
    delete env.ANTHROPIC_API_KEY;
    delete env.HYPEMAN_FORCE_MOCK;
    proc = spawn(join(root, 'node_modules/.bin/tsx'), [join(root, 'server/index.ts')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (d) => (log += String(d)));
    proc.stderr?.on('data', (d) => (log += String(d)));
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        if (r.ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error(`server did not start:\n${log}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }, 30_000);

  afterAll(() => {
    proc?.kill();
  });

  it('health reports mock mode and a hype request returns a line', async () => {
    const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
    expect(health).toMatchObject({ ok: true, mode: 'mock', model: null });
    expect(log).toMatch(/mock mode/);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hype`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5399' },
      body: JSON.stringify({ persona: 'hype', trigger: 'manual', recent: [], hint: 'Q3 Forecast - Google Sheets' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ speak: true, mode: 'mock' });
    expect(json.line.length).toBeGreaterThan(5);
  });

  it('mock mode is not cost-capped: 30 quick requests all succeed (the browser limiter is the guard)', async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        fetch(`http://127.0.0.1:${PORT}/api/hype`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persona: 'coach', trigger: 'auto', recent: [] }),
        }).then((r) => r.status),
      ),
    );
    expect(results.every((s) => s === 200)).toBe(true);
  });
});
