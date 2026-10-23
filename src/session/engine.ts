import { isNearDuplicate, remember } from '../../shared/dedupe';
import type { PersonaId } from '../../shared/personas';
import { RateLimiter, type RateLimitConfig } from '../../shared/rateLimiter';
import {
  IDLE_AFTER_MS,
  SAMPLE_EVERY_MS,
  errorBackoff,
  inQuietHours,
  jitter,
  nextDelay,
  retryAfterSilence,
  type Frequency,
  type QuietHours,
  type Rng,
} from '../../shared/scheduler';
import type { HypeRequest, HypeResponse, Mode } from '../../shared/types';
import { lumaDiff } from '../capture/pixelDiff';

/* ───────────────────────── dependencies (all injectable) ───────────────────────── */

export interface CaptureHandle {
  /** Title of the shared surface, if the browser exposes a useful one. */
  hint?: string;
  /** Tiny luma thumbnail for idle detection, or null if no frame is available. */
  sampleThumb(): Uint8ClampedArray | null;
  /** One ≤1024px JPEG data URL — called only when we are about to comment. */
  grabFrame(): Promise<string | null>;
  onEnded(cb: () => void): void;
  stop(): void;
}

export type CaptureErrorKind = 'denied' | 'cancelled' | 'unsupported' | 'failed';

export class CaptureError extends Error {
  constructor(readonly kind: CaptureErrorKind, message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HypeApi {
  hype(req: HypeRequest): Promise<HypeResponse>;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface EngineDeps {
  /** Monotonic milliseconds — used for every rate-limit decision. */
  now(): number;
  /** Wall clock — used only for display timestamps and quiet hours. */
  wallNow(): number;
  timers: Timers;
  rng: Rng;
  startCapture(): Promise<CaptureHandle>;
  api: HypeApi;
  rateLimit?: Partial<RateLimitConfig>;
  /** Ages (ms) of comments delivered before this engine existed, e.g. before a reload. */
  seedAges?: number[];
}

export interface EngineSettings {
  persona: PersonaId;
  frequency: Frequency;
  quietHours: QuietHours;
  /** False in mock mode: the server doesn't need pixels, so none are sent. */
  sendFrame: boolean;
}

/* ───────────────────────── state exposed to the UI ───────────────────────── */

export type Phase = 'off' | 'starting' | 'active' | 'ended';
export type EndReason = 'stopped' | 'share-ended' | 'denied' | 'cancelled' | 'unsupported' | 'failed';
export type Status = 'off' | 'starting' | 'listening' | 'thinking' | 'idle' | 'paused' | 'snoozed' | 'quiet' | 'ended';

export interface FeedItem {
  id: string;
  line: string;
  /** Wall-clock ms */
  at: number;
  mode: Mode;
  trigger: 'auto' | 'manual';
  reaction: 'up' | 'down' | null;
  context?: HypeResponse['context'];
}

export interface Notice {
  kind: 'info' | 'warn' | 'error';
  text: string;
  /** Monotonic ms when it was raised. */
  at: number;
}

export interface EngineState {
  phase: Phase;
  status: Status;
  endReason: EndReason | null;
  paused: boolean;
  snoozedUntil: number | null; // monotonic
  idle: boolean;
  quiet: boolean;
  thinking: boolean;
  usedInWindow: number;
  maxInWindow: number;
  /** Monotonic time when the next comment slot opens, if currently limited. */
  limitedUntil: number | null;
  /** Why we're limited: the 2-per-10-minutes cap, or the 90 s minimum gap. */
  limitReason: 'window' | 'gap' | null;
  feed: FeedItem[];
  notice: Notice | null;
  hint?: string;
}

export type ManualResult =
  | { kind: 'spoke'; item: FeedItem }
  | { kind: 'limited'; retryAt: number }
  | { kind: 'silent'; reason: string }
  | { kind: 'busy' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

type Listener = (s: EngineState) => void;
type CommentListener = (item: FeedItem) => void;

let idSeq = 0;
const newId = () => `c${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/* ───────────────────────── the engine ───────────────────────── */

export class SessionEngine {
  private readonly deps: EngineDeps;
  private settings: EngineSettings;
  readonly limiter: RateLimiter;

  private phase: Phase = 'off';
  private endReason: EndReason | null = null;
  private paused = false;
  private snoozedUntil: number | null = null;
  private thinking = false;
  private feed: FeedItem[] = [];
  private recent: string[] = [];
  private notice: Notice | null = null;

  private capture: CaptureHandle | null = null;
  private lastThumb: Uint8ClampedArray | null = null;
  private lastActivity = 0;
  private consecutiveErrors = 0;
  /** Bumped on every start/stop/pause/resume so stale async results are discarded. */
  private epoch = 0;

  private attemptTimer: unknown = null;
  private attemptAt: number | null = null;
  private sampleTimer: unknown = null;
  private snoozeTimer: unknown = null;

  private listeners = new Set<Listener>();
  private commentListeners = new Set<CommentListener>();

  constructor(deps: EngineDeps, settings: EngineSettings) {
    this.deps = deps;
    this.settings = settings;
    this.limiter = new RateLimiter(deps.rateLimit);
    if (deps.seedAges?.length) this.limiter.seed(deps.now(), deps.seedAges);
  }

  /* ── subscriptions ── */

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  onComment(fn: CommentListener): () => void {
    this.commentListeners.add(fn);
    return () => this.commentListeners.delete(fn);
  }

  private emit(): void {
    const s = this.getState();
    for (const l of this.listeners) l(s);
  }

  getState(): EngineState {
    const now = this.deps.now();
    const decision = this.limiter.check(now);
    const quiet = this.isQuiet();
    const idle = this.isIdle(now);
    const snoozed = this.snoozedUntil !== null && now < this.snoozedUntil;
    let status: Status;
    if (this.phase === 'off') status = 'off';
    else if (this.phase === 'starting') status = 'starting';
    else if (this.phase === 'ended') status = 'ended';
    else if (this.thinking) status = 'thinking';
    else if (this.paused) status = 'paused';
    else if (snoozed) status = 'snoozed';
    else if (quiet) status = 'quiet';
    else if (idle) status = 'idle';
    else status = 'listening';
    return {
      phase: this.phase,
      status,
      endReason: this.endReason,
      paused: this.paused,
      snoozedUntil: snoozed ? this.snoozedUntil : null,
      idle,
      quiet,
      thinking: this.thinking,
      usedInWindow: decision.usedInWindow,
      maxInWindow: this.limiter.config.maxInWindow,
      limitedUntil: decision.ok ? null : decision.retryAt,
      limitReason: decision.ok ? null : decision.reason,
      feed: this.feed,
      notice: this.notice,
      hint: this.capture?.hint,
    };
  }

  /* ── settings ── */

  updateSettings(patch: Partial<EngineSettings>): void {
    const freqChanged = patch.frequency && patch.frequency !== this.settings.frequency;
    this.settings = { ...this.settings, ...patch };
    // A new frequency takes effect from now, never by firing early: just re-draw the next delay.
    if (freqChanged && this.phase === 'active' && !this.paused) this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    this.emit();
  }

  /* ── lifecycle ── */

  async start(): Promise<void> {
    if (this.phase === 'starting' || this.phase === 'active') return;
    this.epoch++;
    const epoch = this.epoch;
    this.phase = 'starting';
    this.endReason = null;
    this.notice = null;
    this.paused = false;
    this.snoozedUntil = null;
    this.emit();
    let handle: CaptureHandle;
    try {
      handle = await this.deps.startCapture();
    } catch (err) {
      if (epoch !== this.epoch) return;
      this.phase = 'ended';
      this.endReason = err instanceof CaptureError ? err.kind : 'failed';
      this.emit();
      return;
    }
    if (epoch !== this.epoch) {
      handle.stop();
      return;
    }
    this.capture = handle;
    handle.onEnded(() => this.end('share-ended'));
    this.phase = 'active';
    this.lastActivity = this.deps.now();
    this.lastThumb = handle.sampleThumb();
    this.consecutiveErrors = 0;
    this.scheduleSample();
    this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    this.emit();
  }

  stop(): void {
    this.end('stopped');
  }

  private end(reason: EndReason): void {
    if (this.phase === 'off' || this.phase === 'ended') return;
    this.epoch++;
    this.clearTimers();
    this.capture?.stop();
    this.capture = null;
    this.lastThumb = null;
    this.thinking = false;
    this.paused = false;
    this.snoozedUntil = null;
    this.phase = 'ended';
    this.endReason = reason;
    this.emit();
  }

  /** Return to the start screen (keeps nothing but rate-limit history). */
  reset(): void {
    if (this.phase === 'active' || this.phase === 'starting') this.end('stopped');
    this.phase = 'off';
    this.endReason = null;
    this.feed = [];
    this.recent = [];
    this.notice = null;
    this.emit();
  }

  pause(): void {
    if (this.phase !== 'active' || this.paused) return;
    this.epoch++;
    this.paused = true;
    this.thinking = false;
    this.clearAttempt();
    this.clearSample();
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'active' || !this.paused) return;
    this.epoch++;
    this.paused = false;
    // Coming back from a pause counts as activity, and we never fire immediately.
    this.lastActivity = this.deps.now();
    this.lastThumb = this.capture?.sampleThumb() ?? null;
    this.scheduleSample();
    this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    this.emit();
  }

  snooze(minutes: number): void {
    if (this.phase !== 'active') return;
    const ms = Math.max(1, Math.min(minutes, 24 * 60)) * 60_000;
    this.snoozedUntil = this.deps.now() + ms;
    this.clearAttempt();
    if (this.snoozeTimer !== null) this.deps.timers.clearTimeout(this.snoozeTimer);
    this.snoozeTimer = this.deps.timers.setTimeout(() => this.endSnooze(), ms);
    this.emit();
  }

  endSnooze(): void {
    if (this.snoozeTimer !== null) this.deps.timers.clearTimeout(this.snoozeTimer);
    this.snoozeTimer = null;
    if (this.snoozedUntil === null) return;
    this.snoozedUntil = null;
    if (this.phase === 'active' && !this.paused) this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    this.emit();
  }

  react(id: string, reaction: 'up' | 'down' | null): FeedItem | undefined {
    const item = this.feed.find((f) => f.id === id);
    if (!item) return undefined;
    const updated = { ...item, reaction: item.reaction === reaction ? null : reaction };
    this.feed = this.feed.map((f) => (f.id === id ? updated : f));
    this.emit();
    return updated;
  }

  dismissNotice(): void {
    this.notice = null;
    this.emit();
  }

  /** Re-evaluate time-based state (idle, quiet hours, countdowns). Called by the UI's 1s tick. */
  refresh(): void {
    if (this.snoozedUntil !== null && this.deps.now() >= this.snoozedUntil) this.endSnooze();
    this.emit();
  }

  /* ── gates ── */

  private isQuiet(): boolean {
    return inQuietHours(this.settings.quietHours, new Date(this.deps.wallNow()));
  }

  private isIdle(now: number): boolean {
    return this.phase === 'active' && now - this.lastActivity >= IDLE_AFTER_MS;
  }

  /* ── sampling (idle detection only — thumbnails never leave the browser) ── */

  private scheduleSample(): void {
    this.clearSample();
    this.sampleTimer = this.deps.timers.setTimeout(() => this.sample(), SAMPLE_EVERY_MS);
  }

  private sample(): void {
    this.sampleTimer = null;
    if (this.phase !== 'active' || this.paused || !this.capture) return;
    const now = this.deps.now();
    const wasIdle = this.isIdle(now);
    const thumb = this.capture.sampleThumb();
    if (thumb && this.lastThumb && thumb.length === this.lastThumb.length) {
      if (lumaDiff(this.lastThumb, thumb).active) this.lastActivity = now;
    } else if (thumb && !this.lastThumb) {
      this.lastActivity = now;
    }
    if (thumb) this.lastThumb = thumb;
    const isIdle = this.isIdle(now);
    // Coming back from idle: don't pounce. Wait a short random moment before the next try.
    if (wasIdle && !isIdle && !this.snoozedUntil) {
      const soon = jitter(this.deps.rng, 120_000);
      if (this.attemptAt === null || this.attemptAt > now + soon) this.scheduleAttempt(soon);
    }
    this.scheduleSample();
    if (wasIdle !== isIdle) this.emit();
  }

  /* ── automatic attempts ── */

  private scheduleAttempt(delayMs: number): void {
    this.clearAttempt();
    this.attemptAt = this.deps.now() + delayMs;
    this.attemptTimer = this.deps.timers.setTimeout(() => {
      this.attemptTimer = null;
      this.attemptAt = null;
      void this.autoAttempt();
    }, delayMs);
  }

  private async autoAttempt(): Promise<void> {
    if (this.phase !== 'active' || this.paused) return;
    const now = this.deps.now();
    if (this.snoozedUntil !== null && now < this.snoozedUntil) return; // snooze end reschedules
    if (this.isQuiet()) return this.scheduleAttempt(5 * 60_000 + jitter(this.deps.rng));
    if (this.isIdle(now)) return this.scheduleAttempt(60_000 + jitter(this.deps.rng)); // re-check; sample() also reschedules on return
    if (this.thinking) return this.scheduleAttempt(jitter(this.deps.rng));
    const result = await this.generate('auto');
    if (this.phase !== 'active' || this.paused || this.attemptTimer !== null) return;
    switch (result.kind) {
      case 'limited':
        return this.scheduleAttempt(Math.max(0, result.retryAt - this.deps.now()) + jitter(this.deps.rng));
      case 'silent':
        return this.scheduleAttempt(retryAfterSilence(this.deps.rng));
      case 'error':
        return this.scheduleAttempt(errorBackoff(this.consecutiveErrors, this.deps.rng));
      default:
        return this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    }
  }

  /* ── "Hype me now" ── */

  async hypeNow(): Promise<ManualResult> {
    if (this.phase !== 'active' || this.paused) return { kind: 'unavailable' };
    const result = await this.generate('manual');
    if (result.kind === 'spoke' && this.phase === 'active' && !this.paused) {
      // Restart the random timer so an automatic comment doesn't follow right behind.
      this.scheduleAttempt(nextDelay(this.settings.frequency, this.deps.rng));
    }
    return result;
  }

  /* ── the one path that can produce a comment ── */

  private async generate(trigger: 'auto' | 'manual'): Promise<ManualResult> {
    if (this.thinking) return { kind: 'busy' };
    const capture = this.capture;
    if (!capture) return { kind: 'unavailable' };

    // Reserve the slot *before* any await so concurrent triggers can never double-spend.
    const acquired = this.limiter.tryAcquire(this.deps.now());
    if (!acquired.ok) {
      this.emit();
      return { kind: 'limited', retryAt: acquired.retryAt };
    }
    const token = acquired.token!;
    const epoch = this.epoch;
    this.thinking = true;
    this.emit();

    const abandon = (r: ManualResult): ManualResult => {
      this.limiter.release(token);
      if (epoch === this.epoch) this.thinking = false;
      this.emit();
      return r;
    };

    let res: HypeResponse;
    try {
      const image = this.settings.sendFrame ? await capture.grabFrame() : null;
      if (epoch !== this.epoch) return abandon({ kind: 'unavailable' });
      res = await this.deps.api.hype({
        image: image ?? undefined,
        persona: this.settings.persona,
        recent: this.recent,
        hint: capture.hint,
        trigger,
      });
    } catch (err) {
      if (epoch !== this.epoch) return abandon({ kind: 'unavailable' });
      this.consecutiveErrors++;
      const message = err instanceof Error && err.message ? err.message : 'Could not reach Hypeman.';
      this.notice = { kind: 'error', text: message, at: this.deps.now() };
      return abandon({ kind: 'error', message });
    }

    // Session stopped, paused or restarted while we were waiting: drop the result.
    if (epoch !== this.epoch) return abandon({ kind: 'unavailable' });
    this.consecutiveErrors = 0;
    if (this.notice?.kind === 'error') this.notice = null;

    if (!res.speak || !res.line.trim() || isNearDuplicate(res.line, this.recent)) {
      return abandon({ kind: 'silent', reason: res.speak ? 'duplicate' : res.reason });
    }

    const item: FeedItem = {
      id: newId(),
      line: res.line.trim(),
      at: this.deps.wallNow(),
      mode: res.mode,
      trigger,
      reaction: null,
      context: res.context,
    };
    this.feed = [item, ...this.feed];
    this.recent = remember(this.recent, item.line);
    this.thinking = false;
    this.emit();
    for (const l of this.commentListeners) l(item);
    return { kind: 'spoke', item };
  }

  /* ── timers ── */

  private clearAttempt(): void {
    if (this.attemptTimer !== null) this.deps.timers.clearTimeout(this.attemptTimer);
    this.attemptTimer = null;
    this.attemptAt = null;
  }

  private clearSample(): void {
    if (this.sampleTimer !== null) this.deps.timers.clearTimeout(this.sampleTimer);
    this.sampleTimer = null;
  }

  private clearTimers(): void {
    this.clearAttempt();
    this.clearSample();
    if (this.snoozeTimer !== null) this.deps.timers.clearTimeout(this.snoozeTimer);
    this.snoozeTimer = null;
  }

  /** For tests/diagnostics. */
  get nextAttemptAt(): number | null {
    return this.attemptAt;
  }

  get recentLines(): readonly string[] {
    return this.recent;
  }
}
