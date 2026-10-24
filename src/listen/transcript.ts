/**
 * Rolling, in-memory transcript of the last ~45 s of conversation (listen mode) and the pause
 * detector that decides when Hypeman might chime in. Pure: the caller supplies timestamps.
 * Nothing here is ever persisted.
 */

export const TRANSCRIPT_WINDOW_MS = 45_000;
/** Silence after speech that counts as a natural pause. */
export const PAUSE_MS = 1_300;
/** New words needed since the last moment before another one can fire. */
export const MIN_NEW_WORDS = 6;

interface Chunk {
  text: string;
  at: number;
  words: number;
}

export class TranscriptBuffer {
  private chunks: Chunk[] = [];
  private interim = '';
  private lastHeardAt = -Infinity;
  private wordsSinceMoment = 0;
  private momentArmed = false;

  /** A finished phrase from speech recognition. */
  addFinal(text: string, at: number): void {
    const t = text.trim();
    if (!t) return;
    const words = t.split(/\s+/).length;
    this.chunks.push({ text: t, at, words });
    this.interim = '';
    this.heard(at);
    this.wordsSinceMoment += words;
    this.momentArmed = true;
    this.prune(at);
  }

  /** A phrase still being spoken (shown live, counts as "someone is talking"). */
  setInterim(text: string, at: number): void {
    this.interim = text.trim();
    if (this.interim) this.heard(at);
  }

  private heard(at: number): void {
    this.lastHeardAt = Math.max(this.lastHeardAt, at);
  }

  private prune(now: number): void {
    this.chunks = this.chunks.filter((c) => now - c.at <= TRANSCRIPT_WINDOW_MS);
  }

  /** The recent conversation, oldest first. */
  text(now: number): string {
    this.prune(now);
    return this.chunks.map((c) => c.text).join(' ');
  }

  /** The last few words heard, for the on-screen "Hearing: …" line. */
  latest(maxChars = 80): string {
    const s = [this.chunks.at(-1)?.text ?? '', this.interim].filter(Boolean).join(' ');
    return s.length > maxChars ? '…' + s.slice(-maxChars) : s;
  }

  /**
   * True once per natural pause: speech stopped for PAUSE_MS, nobody is mid-sentence, and
   * enough new words were said since the last moment. Calling it consumes the moment.
   */
  takeMoment(now: number): boolean {
    if (!this.momentArmed || this.interim) return false;
    if (now - this.lastHeardAt < PAUSE_MS) return false;
    if (this.wordsSinceMoment < MIN_NEW_WORDS) return false;
    this.momentArmed = false;
    this.wordsSinceMoment = 0;
    return true;
  }

  /** Drop everything (e.g. while Hypeman himself is talking, or on stop). */
  clear(): void {
    this.chunks = [];
    this.interim = '';
    this.wordsSinceMoment = 0;
    this.momentArmed = false;
  }
}
