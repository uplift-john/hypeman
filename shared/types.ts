import type { Category } from './context';
import type { PersonaId } from './personas';

export type Mode = 'mock' | 'real';

export interface HypeRequest {
  /** data:image/jpeg;base64,… — at most one frame, only sent when it's time to comment. */
  image?: string;
  persona: PersonaId;
  /** Last ≤20 lines spoken this session (for de-duplication). */
  recent: string[];
  /** Title of the shared surface when the browser exposes one. */
  hint?: string;
  /** auto = random timer, manual = "Hype me now", moment = a pause in the conversation (listen mode). */
  trigger: 'auto' | 'manual' | 'moment';
  /** Listen mode: the last ~45 s of the conversation as speech-to-text. Never stored or logged. */
  transcript?: string;
}

export const MAX_TRANSCRIPT_CHARS = 2_000;

/** How Hypeman follows along: hears the room, watches the screen, or both. */
export type SessionKind = 'listen' | 'watch' | 'both';

export interface HypeResponse {
  speak: boolean;
  line: string;
  /** Short machine-ish reason, e.g. "sensitive", "duplicate", "nothing-notable", "ok". */
  reason: string;
  mode: Mode;
  /** Mock mode only: the (fake or title-derived) context the line is about. */
  context?: { category: Category; subject: string; source: 'title' | 'fake' };
}

export interface HealthResponse {
  ok: true;
  mode: Mode;
  model: string | null;
  /** Where Hypeman's voice comes from. */
  voice?: 'elevenlabs' | 'browser';
  /** Public deployments require a passcode; `user` is null until signed in. */
  auth?: { required: boolean; user: string | null; codesLoaded?: number };
  /** Vercel environment (production / preview), for troubleshooting. */
  env?: string;
}

export const MAX_IMAGE_BYTES = 1_500_000;
/** Spoken out loud: tiny reactions, not paragraphs. */
export const MAX_WORDS = 12;
/** Hard ceiling applied after generation — anything longer is dropped, not truncated. */
export const MAX_WORDS_HARD = 16;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
