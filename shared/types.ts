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
  trigger: 'auto' | 'manual';
}

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
}

export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_WORDS = 25;
/** Hard ceiling applied after generation — anything longer is dropped, not truncated. */
export const MAX_WORDS_HARD = 32;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
