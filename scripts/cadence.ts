/** Measures the average gap between automatic comments for each frequency preset (simulated, active user). */
import { FREQUENCY_DELAYS, type Frequency } from '../shared/scheduler';
import { SessionEngine } from '../src/session/engine';

const MIN = 60_000;
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function measure(freq: Frequency, seeds = 20): Promise<number> {
  const gaps: number[] = [];
  for (let s = 1; s <= seeds; s++) {
    let t = 0;
    let seq = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let n = 0;
    const spoken: number[] = [];
    const e = new SessionEngine(
      {
        now: () => t,
        wallNow: () => new Date(2026, 0, 5, 10).getTime() + t,
        timers: { setTimeout: (fn, ms) => (timers.set(++seq, { at: t + ms, fn }), seq), clearTimeout: (id) => timers.delete(id as number) },
        rng: seeded(s),
        startCapture: async () => ({
          sampleThumb: () => new Uint8ClampedArray(2304).fill(n++ % 2 ? 200 : 20),
          grabFrame: async () => null,
          onEnded: () => {},
          stop: () => {},
        }),
        api: { hype: async () => ({ speak: true, line: `line ${Math.random()} ${n} unique ${s}`, reason: 'ok', mode: 'mock' }) },
      },
      { persona: 'hype', frequency: freq, quietHours: { enabled: false, start: '22:00', end: '08:00' }, sendFrame: false },
    );
    e.onComment(() => spoken.push(t));
    await e.start();
    while (t < 8 * 60 * MIN) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      t = next[1].at;
      next[1].fn();
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    }
    for (let i = 1; i < spoken.length; i++) gaps.push(spoken[i] - spoken[i - 1]);
  }
  return gaps.reduce((a, b) => a + b, 0) / gaps.length / MIN;
}

const ranges = process.argv.slice(2);
for (const f of ['chill', 'normal', 'max'] as Frequency[]) {
  console.log(f, FREQUENCY_DELAYS[f].minMs / MIN, '–', FREQUENCY_DELAYS[f].maxMs / MIN, 'min →', (await measure(f)).toFixed(2), 'min average gap');
}
if (ranges.length) {
  for (const r of ranges) {
    const [a, b] = r.split('-').map(Number);
    FREQUENCY_DELAYS.normal = { minMs: a * MIN, maxMs: b * MIN };
    console.log('normal', a, b, (await measure('normal')).toFixed(2));
  }
}
