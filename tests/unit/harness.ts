import type { HypeRequest, HypeResponse } from '../../shared/types';
import { CaptureError, SessionEngine, type CaptureHandle, type EngineSettings, type FeedItem } from '../../src/session/engine';

export const MIN = 60_000;

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flush pending promise callbacks (fake API resolves via microtasks/macrotasks). */
export const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

/** A fake timer queue driving "true time". The engine's clock can be skewed independently. */
export class FakeTime {
  t = 0;
  /** Added to `t` for what the engine's monotonic clock reports. */
  skew = 0;
  /** Wall clock base: Monday 5 Jan 2026, 10:00 local. */
  wallBase = new Date(2026, 0, 5, 10, 0, 0).getTime();
  wallSkew = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now = () => this.t + this.skew;
  wallNow = () => this.wallBase + this.t + this.wallSkew;

  timers_ = {
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++this.seq;
      this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout: (id: unknown) => {
      this.timers.delete(id as number);
    },
  };

  pending(): number {
    return this.timers.size;
  }

  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const e of this.timers) if (e[1].at <= target && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0]))) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      next[1].fn();
      await flush();
    }
    this.t = target;
    await flush();
  }
}

export class FakeCapture implements CaptureHandle {
  hint?: string;
  active = true;
  stopped = false;
  frames = 0;
  thumbs = 0;
  private n = 0;
  private ended: Array<() => void> = [];
  constructor(hint?: string) {
    this.hint = hint;
  }
  sampleThumb() {
    this.thumbs++;
    if (this.active) this.n++;
    const a = new Uint8ClampedArray(64 * 36);
    a.fill(this.n % 2 ? 200 : 20);
    return a;
  }
  async grabFrame() {
    this.frames++;
    return 'data:image/jpeg;base64,AAAA';
  }
  onEnded(cb: () => void) {
    this.ended.push(cb);
  }
  stop() {
    this.stopped = true;
  }
  /** Simulate the user ending the share from the browser UI. */
  revoke() {
    this.stopped = true;
    this.ended.forEach((cb) => cb());
  }
}

export type Responder = (req: HypeRequest, i: number) => HypeResponse | Promise<HypeResponse>;

let lineSeq = 0;
/** Unique lines whose tokens never overlap, so dedupe only interferes when a test wants it to. */
export const uniqueLine = () => {
  const i = lineSeq++;
  return `Sheet${i} tab${i}x looks${i}y sharp${i}z today${i}w`;
};

export const speakOk: Responder = () => ({ speak: true, line: uniqueLine(), reason: 'ok', mode: 'mock' });

export interface Harness {
  time: FakeTime;
  engine: SessionEngine;
  capture: FakeCapture;
  calls: HypeRequest[];
  /** True times at which comments were delivered. */
  spoken: number[];
  items: FeedItem[];
  setResponder(r: Responder): void;
}

export function makeHarness(
  opts: {
    seed?: number;
    settings?: Partial<EngineSettings>;
    responder?: Responder;
    hint?: string;
    seedAges?: number[];
    startError?: CaptureError;
  } = {},
): Harness {
  const time = new FakeTime();
  const capture = new FakeCapture(opts.hint ?? 'Q3 Forecast - Google Sheets');
  const calls: HypeRequest[] = [];
  const spoken: number[] = [];
  const items: FeedItem[] = [];
  let responder: Responder = opts.responder ?? speakOk;
  const engine = new SessionEngine(
    {
      now: time.now,
      wallNow: time.wallNow,
      timers: time.timers_,
      rng: seeded(opts.seed ?? 1),
      startCapture: async () => {
        if (opts.startError) throw opts.startError;
        return capture;
      },
      api: {
        hype: async (req) => {
          calls.push(req);
          return responder(req, calls.length - 1);
        },
      },
      seedAges: opts.seedAges,
    },
    {
      persona: 'hype',
      frequency: 'normal',
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      sendFrame: true,
      ...opts.settings,
    },
  );
  engine.onComment((item) => {
    spoken.push(time.t);
    items.push(item);
  });
  return { time, engine, capture, calls, spoken, items, setResponder: (r) => (responder = r) };
}
