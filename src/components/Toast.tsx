import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '../session/engine';
import { IconClose, IconSparkle } from './Icons';
import { ReactionButtons } from './SessionView';

export const TOAST_MS = 8_000;

interface Props {
  item: FeedItem | null;
  personaName: string;
  onDismiss(): void;
  onReact(id: string, r: 'up' | 'down'): void;
}

/**
 * The live region is always mounted (so screen readers reliably announce new
 * content); the card inside it comes and goes. Hover or focus holds the toast.
 */
export function ToastRegion({ item, personaName, onDismiss, onReact }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-3 sm:bottom-4 sm:right-4 sm:left-auto sm:p-0">
      <div role="status" aria-live="polite" aria-atomic="true" className="w-full sm:w-[24rem]">
        {item && <ToastCard key={item.id} item={item} personaName={personaName} onDismiss={onDismiss} onReact={onReact} />}
      </div>
    </div>
  );
}

function ToastCard({ item, personaName, onDismiss, onReact }: { item: FeedItem; personaName: string; onDismiss(): void; onReact(id: string, r: 'up' | 'down'): void }) {
  const [held, setHeld] = useState(false);
  const remaining = useRef(TOAST_MS);
  const startedAt = useRef(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (held) return;
    startedAt.current = performance.now();
    const t = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current = Math.max(1_500, remaining.current - (performance.now() - startedAt.current));
    };
  }, [held, onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      data-testid="toast"
      className="hm-toast-in pointer-events-auto relative overflow-hidden rounded-[1.375rem] border border-line bg-surface shadow-pop"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setHeld(false);
      }}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-accent" aria-hidden="true" />
      <div className="py-4 pl-5 pr-4">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent-ink">
            <IconSparkle width={14} height={14} /> {personaName}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Dismiss comment"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>
        <p className="mt-1 pr-2 font-display text-[19px] font-semibold leading-snug text-pretty">{item.line}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">{held ? 'Held while you hover' : 'Hover to keep it here'}</p>
          <ReactionButtons item={item} onReact={onReact} compact />
        </div>
      </div>
      <div className="h-1 w-full bg-surface-2" aria-hidden="true">
        <div
          className="hm-progress h-full bg-accent"
          style={{ animationDuration: `${TOAST_MS}ms`, animationPlayState: held ? 'paused' : 'running' }}
        />
      </div>
    </div>
  );
}
