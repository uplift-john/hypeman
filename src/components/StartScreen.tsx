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
  mode: Mode | null;
  serverDown: boolean;
  starting: boolean;
  error: EndReason | null;
  persona: PersonaId;
  onPersona(p: PersonaId): void;
  onStart(): void;
  onOpenSettings(): void;
}

export function StartScreen({ mode, serverDown, starting, error, persona, onPersona, onStart, onOpenSettings }: Props) {
  const err = error ? START_ERRORS[error] : undefined;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2">
          {mode === 'mock' && (
            <Badge tone="neutral" className="hidden min-[380px]:inline-flex">
              Mock mode
            </Badge>
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
          Get hyped about the work you’re <span className="text-accent-ink">actually</span> doing.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted text-pretty">
          Share a window, tab or screen. Every few minutes Hypeman notices something specific and tells you
          what’s good about it — like a friend glancing over your shoulder.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Privacy">
          <Promise icon={<IconEye />} title="You choose what it sees">
            One window, tab or screen. Stop anytime.
          </Promise>
          <Promise icon={<IconLock />} title="Nothing is stored">
            {mode === 'mock'
              ? 'In mock mode no screenshot ever leaves your browser.'
              : 'One screenshot is sent only when it’s about to comment, then gone.'}
          </Promise>
          <Promise icon={<IconShield />} title="Private stays private">
            Banking, passwords, health and messages get silence.
          </Promise>
        </ul>

        <fieldset className="mt-8">
          <legend className="text-sm font-semibold text-muted">Pick a voice</legend>
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
        {serverDown && (
          <div role="alert" className="mt-6 rounded-2xl border border-line bg-danger-soft px-4 py-3">
            <p className="font-semibold">Can’t reach the Hypeman server</p>
            <p className="mt-1 text-sm text-muted">
              Make sure <code className="rounded bg-surface px-1 py-0.5 text-ink">npm run dev</code> is running, then reload this page.
            </p>
          </div>
        )}

        <div className="mt-8">
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
            Your browser will ask which window, tab or screen to share. Max two comments every 10 minutes.
          </p>
        </div>
      </main>
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
