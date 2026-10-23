import { useEffect, useState } from 'react';
import { startScreenCapture } from '../capture/screenCapture';
import { api } from '../lib/api';
import { recentDeliveryAges } from '../lib/storage';
import { SessionEngine, type EngineSettings, type EngineState } from './engine';

const timers = {
  setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  clearTimeout: (id: unknown) => window.clearTimeout(id as number),
};

/** Monotonic clock for every rate-limit decision: immune to wall-clock jumps. */
const monotonicNow = () => performance.now();

export function createEngine(settings: EngineSettings): SessionEngine {
  return new SessionEngine(
    {
      now: monotonicNow,
      wallNow: Date.now,
      timers,
      rng: Math.random,
      startCapture: startScreenCapture,
      api,
      seedAges: recentDeliveryAges(Date.now()),
    },
    settings,
  );
}

export function useSession(settings: EngineSettings) {
  const [engine] = useState(() => createEngine(settings));
  const [state, setState] = useState<EngineState>(() => engine.getState());
  const [clock, setClock] = useState(() => ({ now: monotonicNow(), wall: Date.now() }));

  useEffect(
    () =>
      engine.subscribe((s) => {
        setState(s);
        setClock({ now: monotonicNow(), wall: Date.now() });
      }),
    [engine],
  );

  const { persona, frequency, quietHours, sendFrame } = settings;
  useEffect(() => {
    engine.updateSettings({ persona, frequency, quietHours, sendFrame });
  }, [engine, persona, frequency, quietHours, sendFrame]);

  // One-second tick while a session is live: countdowns, idle/quiet transitions.
  const live = state.phase === 'active';
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      engine.refresh(); // emits → updates state and clock
    }, 1000);
    return () => window.clearInterval(id);
  }, [engine, live]);

  return { engine, state, now: clock.now, wallNow: clock.wall };
}
