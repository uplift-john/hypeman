import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Mode } from '../../shared/types';
import type { EngineState, FeedItem } from '../session/engine';
import { formatClock, formatCountdown } from '../lib/time';
import { IconChevron, IconGear, IconMoon, IconPause, IconPlay, IconSparkle, IconStop, IconThumbDown, IconThumbUp, Logo } from './Icons';
import { useHasScreenshot } from '../hosted/useHasScreenshot';
import { ScreenshotPanel } from './ScreenshotPanel';
import { Badge, Button } from './ui';

export interface ManualFeedback {
  text: string;
  /** Monotonic time it was set; used to auto-clear. */
  at: number;
}

interface Props {
  hosted?: boolean;
  state: EngineState;
  mode: Mode | null;
  /** Monotonic now (ticks every second while a session is live). */
  now: number;
  wallNow: number;
  feedback: ManualFeedback | null;
  onHypeNow(): void;
  onPause(): void;
  onResume(): void;
  onSnooze(minutes: number): void;
  onWake(): void;
  onStop(): void;
  onRestart(): void;
  onHome(): void;
  onReact(id: string, r: 'up' | 'down'): void;
  onOpenSettings(): void;
  onDismissNotice(): void;
  quietEnd: string;
}

interface StatusMeta {
  label: string;
  tone: 'live' | 'accent' | 'muted' | 'warn';
  pulse: boolean;
  desc: string;
}

function statusMeta(s: EngineState, now: number, wallNow: number, quietEnd: string): StatusMeta {
  switch (s.status) {
    case 'thinking':
      return { label: 'Taking a look…', tone: 'accent', pulse: false, desc: 'Grabbing one frame of what you shared to see what’s worth cheering.' };
    case 'listening':
      if (s.limitedUntil !== null) {
        const left = formatCountdown(s.limitedUntil - now);
        return s.limitReason === 'window'
          ? { label: 'Limit reached', tone: 'muted', pulse: false, desc: `That’s ${s.maxInWindow} hypes in 10 minutes, Hypeman’s maximum. Back in ${left}.` }
          : { label: 'Catching its breath', tone: 'muted', pulse: false, desc: `Hypeman leaves at least 90 seconds between comments. Next one possible in ${left}.` };
      }
      return { label: 'Listening', tone: 'live', pulse: true, desc: 'Looking out for something nice to say about what’s going on.' };
    case 'idle':
      return { label: 'Idle', tone: 'muted', pulse: false, desc: 'Your screen hasn’t changed for a few minutes, so Hypeman is staying quiet until you’re back.' };
    case 'paused':
      return { label: 'Paused', tone: 'warn', pulse: false, desc: 'Nothing is being sampled or sent. The share stays connected so you can resume instantly.' };
    case 'snoozed': {
      const left = (s.snoozedUntil ?? now) - now;
      const back = formatClock(wallNow + left);
      return { label: 'Snoozed', tone: 'warn', pulse: false, desc: `No comments until ${back} (${formatCountdown(left)} left). Hype me now still works.` };
    }
    case 'quiet':
      return { label: 'Quiet hours', tone: 'muted', pulse: false, desc: `No automatic comments until ${quietEnd}. Hype me now still works.` };
    case 'ended':
      return s.endReason === 'share-ended'
        ? { label: 'Screen sharing stopped', tone: 'muted', pulse: false, desc: 'The share was ended from the browser, so the session is over. Nothing was kept except the comments below.' }
        : { label: 'Session ended', tone: 'muted', pulse: false, desc: 'Screen sharing is off. Nothing was kept except the comments below.' };
    default:
      return { label: 'Starting…', tone: 'muted', pulse: false, desc: '' };
  }
}

const DOT: Record<StatusMeta['tone'], string> = {
  live: 'text-success',
  accent: 'text-accent-ink',
  muted: 'text-muted',
  warn: 'text-accent-ink',
};

export function SessionView(props: Props) {
  const { state, mode, now, wallNow, feedback, hosted = false } = props;
  const hasShot = useHasScreenshot();
  let meta = statusMeta(state, now, wallNow, props.quietEnd);
  if (hosted && state.status === 'listening' && state.limitedUntil === null) {
    meta = { label: 'Ready', tone: 'live', pulse: false, desc: 'Add a screenshot of whatever’s going on, then press Hype me now.' };
  }
  const live = state.phase === 'active';
  const limited = state.limitedUntil !== null && live;
  const remaining = limited ? state.limitedUntil! - now : 0;

  let hypeLabel = 'Hype me now';
  let hypeBlocked: string | null = null;
  if (state.paused) hypeBlocked = 'Resume the session to get hyped.';
  else if (hosted && !hasShot && mode === 'real') hypeBlocked = 'Add a screenshot first.';
  else if (state.thinking) {
    hypeLabel = 'Taking a look…';
    hypeBlocked = 'Already looking — one moment.';
  } else if (limited) {
    hypeLabel = `Next hype in ${formatCountdown(remaining)}`;
    hypeBlocked =
      state.limitReason === 'window'
        ? `That’s ${state.maxInWindow} comments in the last 10 minutes — Hypeman’s limit. The next slot opens in ${formatCountdown(remaining)}.`
        : `Hypeman leaves at least 90 seconds between comments. The next slot opens in ${formatCountdown(remaining)}.`;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-28 pt-4 sm:px-6 sm:pt-6">
      <header className="flex items-center justify-between gap-2">
        <Logo />
        <div className="flex min-w-0 items-center gap-2">
          {mode === 'mock' && (
            <span className="hidden min-[480px]:contents">
              <Badge>{hosted ? 'Sample lines' : 'Mock mode'}</Badge>
            </span>
          )}
          {live && !hosted && (
            <Badge tone={state.paused ? 'neutral' : 'live'} className="shrink-0">
              <span className={`relative inline-block h-2 w-2 shrink-0 rounded-full bg-current ${state.paused ? '' : 'hm-pulse'}`} aria-hidden="true" />
              <span className="min-[420px]:hidden">{state.paused ? 'Paused' : 'Live'}</span>
              <span className="hidden min-[420px]:inline">{state.paused ? 'Share paused' : 'Sharing screen'}</span>
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={props.onOpenSettings} aria-label="Settings">
            <IconGear />
          </Button>
        </div>
      </header>

      {state.notice && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-danger-soft px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-semibold">Couldn’t come up with a comment just now.</span> {state.notice.text} Hypeman will quietly try again in a few minutes.
          </p>
          <button type="button" onClick={props.onDismissNotice} className="shrink-0 text-sm font-semibold underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      <main className="mt-5 flex flex-col gap-4" aria-label="Session">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card sm:p-6" aria-labelledby="status-label">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Status</p>
              <h1 id="status-label" className="mt-1.5 flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight" aria-live="polite">
                <span className={`relative inline-block h-3 w-3 shrink-0 rounded-full bg-current ${DOT[meta.tone]} ${meta.pulse ? 'hm-pulse' : ''}`} aria-hidden="true" />
                {state.status === 'thinking' ? (
                  <span>
                    Taking a look<span className="hm-think" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
                  </span>
                ) : (
                  <span>{meta.label}</span>
                )}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-muted text-pretty" data-testid="status-desc">
                {meta.desc}
              </p>
            </div>
          </div>

          {live && (
            <div className="mt-5 grid gap-3 border-t border-line pt-4 min-[400px]:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">This 10 minutes</p>
                <p className="mt-1.5 flex items-center gap-2" data-testid="window-meter">
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: state.maxInWindow }, (_, i) => (
                      <span key={i} className={`h-2.5 w-6 rounded-full ${i < state.usedInWindow ? 'bg-accent' : 'bg-surface-2 ring-1 ring-inset ring-line-strong/40'}`} />
                    ))}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.min(state.usedInWindow, state.maxInWindow)} / {state.maxInWindow}
                  </span>
                  <span className="sr-only">comments used in the last 10 minutes</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Next hype</p>
                <p className="mt-1.5 font-semibold" data-testid="next-hype">
                  {hosted && state.limitedUntil === null && !state.thinking ? 'When you press Hype me now' : nextHypeText(state, remaining)}
                </p>
              </div>
            </div>
          )}
        </section>

        {live && hosted && <ScreenshotPanel />}

        {live ? (
          <section aria-label="Controls" className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => !hypeBlocked && props.onHypeNow()}
              aria-disabled={hypeBlocked ? true : undefined}
              aria-describedby="hype-help"
              data-testid="hype-now"
            >
              <IconSparkle />
              <span className="tabular-nums">{hypeLabel}</span>
            </Button>
            {/* The visible hint may tick (countdowns); the live region below only changes when the message does. */}
            <p id="hype-help" className="min-h-5 text-center text-sm text-muted">
              {hypeBlocked && !state.thinking ? hypeBlocked : feedback?.text ?? ''}
            </p>
            <p className="sr-only" aria-live="polite">
              {feedback?.text ?? (state.limitReason === 'window' && limited ? `Limit reached. Next hype at ${formatClock(wallNow + remaining)}.` : '')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {state.paused ? (
                <Button onClick={props.onResume}>
                  <IconPlay width={18} height={18} /> Resume
                </Button>
              ) : (
                <Button onClick={props.onPause}>
                  <IconPause width={18} height={18} /> Pause
                </Button>
              )}
              {state.snoozedUntil !== null ? (
                <Button onClick={props.onWake}>
                  <IconMoon width={18} height={18} /> Wake
                </Button>
              ) : (
                <SnoozeMenu onSnooze={props.onSnooze} disabled={state.paused} />
              )}
              <Button variant="danger" onClick={props.onStop}>
                <IconStop width={18} height={18} /> Stop
              </Button>
            </div>
          </section>
        ) : (
          <section aria-label="Session over" className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <Button variant="primary" size="lg" onClick={props.onRestart}>
              <IconSparkle /> Start again
            </Button>
            <Button size="lg" onClick={props.onHome}>
              Back to start
            </Button>
          </section>
        )}

        <Feed items={state.feed} live={live} status={state.status} mode={mode} onReact={props.onReact} />
      </main>
    </div>
  );
}

function nextHypeText(s: EngineState, remaining: number): string {
  if (s.paused) return 'On hold while paused';
  if (s.status === 'thinking') return 'Coming right up';
  if (s.limitedUntil !== null)
    return s.limitReason === 'window' ? `Limit reached · opens in ${formatCountdown(remaining)}` : `Short breather · ${formatCountdown(remaining)}`;
  if (s.status === 'snoozed') return 'After the snooze';
  if (s.status === 'quiet') return 'After quiet hours';
  if (s.status === 'idle') return 'When you’re back at it';
  return 'Any minute now';
}

function SnoozeMenu({ onSnooze, disabled }: { onSnooze(m: number): void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) btn.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Button
        ref={btn}
        className="w-full"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
      >
        <IconMoon width={18} height={18} /> Snooze <IconChevron width={16} height={16} className={`hidden transition-transform min-[400px]:block ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Snooze for"
          onKeyDown={onKey}
          className="hm-fade-up absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted" aria-hidden="true">
            Snooze for
          </p>
          {[15, 30, 60].map((m) => (
            <button
              key={m}
              type="button"
              role="menuitem"
              className="flex h-11 w-full items-center rounded-xl px-3 text-left font-semibold hover:bg-surface-2 focus-visible:bg-surface-2"
              onClick={() => {
                onSnooze(m);
                close();
              }}
            >
              {m === 60 ? '1 hour' : `${m} minutes`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_COPY: Partial<Record<EngineState['status'], [string, string]>> = {
  paused: ['Paused.', 'Resume whenever you want some hype.'],
  snoozed: ['Snoozed.', 'Hypeman will be back when the snooze ends, or press Hype me now.'],
  idle: ['Waiting for you.', 'Hypeman stays quiet while nothing on screen is changing.'],
  quiet: ['Quiet hours.', 'No automatic comments right now. Hype me now still works.'],
};

function Feed({ items, live, status, mode, onReact }: { items: FeedItem[]; live: boolean; status: EngineState['status']; mode: Mode | null; onReact(id: string, r: 'up' | 'down'): void }) {
  const [emptyTitle, emptyBody] = !live
    ? ['No comments this time.', 'Start again whenever you want a hype man in your corner.']
    : (EMPTY_COPY[status] ?? ['Your first hype is on its way.', 'Keep doing your thing. Hypeman will chime in within a few minutes, or press Hype me now.']);
  return (
    <section className="mt-2" aria-labelledby="feed-title">
      <div className="flex items-baseline justify-between">
        <h2 id="feed-title" className="font-display text-xl font-bold tracking-tight">
          This session
        </h2>
        {items.length > 0 && <span className="text-sm text-muted">{items.length === 1 ? '1 comment' : `${items.length} comments`}</span>}
      </div>
      {items.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/50 px-5 py-8 text-center">
          <p className="font-semibold">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{emptyBody}</p>
        </div>
      ) : (
        <ol className="mt-3 flex flex-col gap-3" data-testid="feed">
          {items.map((item) => (
            <li key={item.id} className="hm-fade-up rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card sm:p-5">
              <p className="font-display text-[17px] font-semibold leading-snug text-pretty">{item.line}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  <time dateTime={new Date(item.at).toISOString()}>{formatClock(item.at)}</time>
                  {item.trigger === 'manual' && <> · on request</>}
                  {mode === 'mock' && item.context && (
                    <> · {item.context.source === 'fake' ? 'sample context' : 'from window title'}</>
                  )}
                </p>
                <ReactionButtons item={item} onReact={onReact} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ReactionButtons({ item, onReact, compact = false }: { item: FeedItem; onReact(id: string, r: 'up' | 'down'): void; compact?: boolean }) {
  const cls = (on: boolean) =>
    `inline-flex ${compact ? 'h-9 w-9' : 'h-10 w-10'} items-center justify-center rounded-xl border transition-colors ${
      on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink'
    }`;
  return (
    <div className="flex gap-1.5">
      <button type="button" className={cls(item.reaction === 'up')} aria-pressed={item.reaction === 'up'} aria-label="Good one" onClick={() => onReact(item.id, 'up')}>
        <IconThumbUp width={18} height={18} />
      </button>
      <button type="button" className={cls(item.reaction === 'down')} aria-pressed={item.reaction === 'down'} aria-label="Not for me" onClick={() => onReact(item.id, 'down')}>
        <IconThumbDown width={18} height={18} />
      </button>
    </div>
  );
}
