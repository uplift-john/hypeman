import manifest from './clipManifest.json';

/**
 * Hypeman's recorded voice: real clips (clips/raw → npm run clips:import). When a pack exists,
 * the model decides *whether* to react and *what vibe* fits; we play a matching clip, never
 * one of the last few.
 */
export type ClipVibe = 'funny' | 'win' | 'agree' | 'greeting' | 'any';
export const CLIP_VIBES: ClipVibe[] = ['funny', 'win', 'agree', 'greeting', 'any'];

export interface Clip {
  id: string;
  src: string;
  /** What the clip says ("" if not labelled yet). */
  text: string;
  vibe: ClipVibe;
  durationMs: number;
}

export const CLIPS: Clip[] = (manifest as { clips: Clip[] }).clips ?? [];
export const hasClips = CLIPS.length > 0;

export function isClipVibe(v: unknown): v is ClipVibe {
  return typeof v === 'string' && (CLIP_VIBES as string[]).includes(v);
}

export function clipById(id: string | undefined): Clip | undefined {
  return id ? CLIPS.find((c) => c.id === id) : undefined;
}

/**
 * Choose a clip: an exact text match to what the model wanted to say, else one with the
 * right vibe, else any — always skipping recently played clips while others are available.
 */
export function pickClip(opts: { vibe?: string; line?: string; recent: readonly string[]; rng: () => number; clips?: Clip[] }): Clip | undefined {
  const all = opts.clips ?? CLIPS;
  if (!all.length) return undefined;
  const speakable = all.filter((c) => c.vibe !== 'greeting');
  if (!speakable.length) return undefined;
  // Skip as many recent clips as possible while always leaving at least one to choose from.
  const keep = Math.min(opts.recent.length, speakable.length - 1);
  const recent = new Set(keep > 0 ? opts.recent.slice(-keep) : []);
  const fresh = speakable.filter((c) => !recent.has(c.id));
  const pool = fresh.length ? fresh : speakable;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/(.)\1{2,}/g, '$1$1').trim();
  if (opts.line) {
    const exact = pool.find((c) => c.text && norm(c.text) === norm(opts.line!));
    if (exact) return exact;
  }
  const vibed = pool.filter((c) => c.vibe === opts.vibe);
  const from = vibed.length ? vibed : pool.filter((c) => c.vibe === 'any').length ? pool.filter((c) => c.vibe === 'any') : pool;
  return from[Math.floor(opts.rng() * from.length) % from.length];
}

/** A clip to say hello with when a session starts (a "greeting" clip if there is one). */
export function greetingClip(): Clip | undefined {
  return CLIPS.find((c) => c.vibe === 'greeting') ?? CLIPS[0];
}
