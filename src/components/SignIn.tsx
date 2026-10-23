import { useState, type FormEvent } from 'react';
import { ApiError } from '../session/engine';
import { IconSparkle, Logo } from './Icons';
import { Button } from './ui';

/** Shown on gated (public) deployments until the person enters their passcode. */
export function SignIn({ onSignedIn, login }: { onSignedIn(): void; login(code: string): Promise<unknown> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(code.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header>
        <Logo />
      </header>
      <main className="mt-16 flex flex-col" aria-labelledby="signin-title">
        <h1 id="signin-title" className="font-display text-4xl font-extrabold leading-tight tracking-tight">
          Your hype man is <span className="text-accent-ink">waiting</span>.
        </h1>
        <p className="mt-3 text-muted">Hypeman is invite-only for now. Enter the passcode you were given.</p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <label htmlFor="passcode" className="text-sm font-semibold text-muted">
            Passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'signin-error' : undefined}
            className="h-12 rounded-xl border border-line-strong bg-surface px-4 text-[17px]"
          />
          {error && (
            <p id="signin-error" role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy || !code.trim()}>
            <IconSparkle /> {busy ? 'Checking…' : 'Let’s go'}
          </Button>
        </form>
      </main>
    </div>
  );
}
