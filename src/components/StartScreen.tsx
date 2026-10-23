import type { ReactNode } from 'react';
import { PERSONAS, PERSONA_IDS, type PersonaId } from '../../shared/personas';
import type { Mode } from '../../shared/types';
import type { EndReason } from '../session/engine';
import { IconEye, IconGear, IconLock, IconShield, IconSparkle, Logo } from './Icons';
import { Badge, Button } from './ui';

const START_ERRORS: Partial<Record<EndReason, { title: string; body: string }>> = {
  denied: {
    title: 'Screen sharing was blocked',
    body: 'Press Start again and pick a window, tab or screen. On macOS you may need to allow your browser under System Settings → Privacy & Security → Screen Recording.',
  },
  cancelled: {
    title: 'No screen picked — no problem',
    body: "Press Start whenever you're ready and choose what Hypeman can see.",
  },
  unsupported: {
    title: "This browser can't share its screen",
    body: 'Try a recent desktop version of Chrome, Edge, Firefox or Safari.',
  },
  failed: {
    title: "Screen sharing didn't start",
    body: 'Something went wrong starting the share. Please try again.',
  },
};

interface Props {
  hosted?: boolean;
  mode: Mode | null;
  serverDown: boolean;
  starting: boolean;
  error: EndReason | null;
  persona: PersonaId;
  onPersona(p: PersonaId): void;
  onStart(): void;
  onOpenSettings(): void;
}

export function StartScreen({ hosted = false, mode, serverDown, starting, error, persona, onPersona, onStart, onOpenSettings }: Props) {
  const err = error ? START_ERRORS[error] : undefined;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2">
          {mode === 'mock' && (
            <span className="hidden min-[400px]:contents">
              <Badge tone="neutral">{hosted ? 'Sample lines' : 'Mock mode'}</Badge>
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
            <IconGear />
          </Button>
        </div>
      </header>

      <main className="mt-8 flex flex-1 flex-col sm:mt-14" aria-labelledby="hero-title">
        <p className="hm-fade-up inline-flex w-fit items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
          <IconSparkle width={16} height={16} /> Your personal hype man
        </p>
        <h1 id="hero-title" className="hm-fade-up mt-4 font-display text-[2.5rem] font-extrabold leading-[1.02] tracking-tight text-balance sm:text-6xl">
          A hype man for whatever you’re <span className="text-accent-ink">up to</span>.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted text-pretty">
          {hosted
            ? 'Show Hypeman a screenshot of what’s going on (a group chat, a call, your photos, a game, even work) and it says something kind and specific about it.'
            : 'Share a window, tab or screen. Every few minutes Hypeman notices what’s going on (a group chat, a call, your photos, a game, even work) and says something kind and specific about it.'}
        </p>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-muted">Pick a vibe</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PERSONA_IDS.map((id) => {
              const p = PERSONAS[id];
              const checked = persona === id;
              return (
                <label
                  key={id}
                  className={`relative cursor-pointer rounded-2xl border px-3 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] ${
                    checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <input type="radio" name="persona" value={id} checked={checked} onChange={() => onPersona(id)} className="sr-only" />
                  <span className="block font-display text-[15px] font-bold leading-tight">{p.name}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{p.tagline}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {err && (
          <div role="alert" className="mt-6 rounded-2xl border border-line bg-warn-soft px-4 py-3">
            <p className="font-semibold">{err.title}</p>
            <p className="mt-1 text-sm text-muted">{err.body}</p>
          </div>
        )}
        {serverDown && !hosted && (
          <div role="alert" className="mt-6 rounded-2xl border border-line bg-danger-soft px-4 py-3">
            <p className="font-semibold">Can’t reach the Hypeman server</p>
            <p className="mt-1 text-sm text-muted">
              Make sure <code className="rounded bg-surface px-1 py-0.5 text-ink">npm run dev</code> is running, then reload this page.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-auto sm:min-w-64"
            onClick={onStart}
            disabled={starting}
            aria-describedby="start-help"
          >
            <IconSparkle />
            {starting ? 'Waiting for you to pick a screen…' : 'Start session'}
          </Button>
          <p id="start-help" className="mt-3 text-sm text-muted">
            {hosted
              ? 'This hosted version works from screenshots. The local app can watch a shared screen live. Max two comments every 10 minutes.'
              : 'Your browser will ask which window, tab or screen to share. Max two comments every 10 minutes.'}
          </p>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Privacy">
          <Promise icon={<IconEye />} title="You choose what it sees">
            {hosted ? 'Only the screenshots you add. Remove them anytime.' : 'One window, tab or screen. Stop anytime.'}
          </Promise>
          <Promise icon={<IconLock />} title="Nothing is stored">
            {hosted
              ? 'Your screenshot is sent to Claude only when you press Hype me now, and never saved.'
              : mode === 'mock'
                ? 'In mock mode no screenshot ever leaves your browser.'
                : 'One screenshot is sent only when it’s about to comment, then gone.'}
          </Promise>
          <Promise icon={<IconShield />} title="Private stays private">
            Banking, passwords, health and dating get silence. Chats get kindness, never quotes.
          </Promise>
        </ul>


      </main>
      {!hosted && (
        <footer className="mt-10 text-sm text-muted">
          <a href="/privacy.html" className="underline underline-offset-2 hover:text-ink">
            What Hypeman sees, sends and keeps
          </a>
        </footer>
      )}
    </div>
  );
}

function Promise({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</span>
      <p className="mt-3 font-semibold leading-snug">{title}</p>
      <p className="mt-1 text-sm leading-snug text-muted">{children}</p>
    </li>
  );
}
