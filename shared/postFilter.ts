import { isNearDuplicate } from './dedupe';
import { lineLooksSensitive } from './sensitive';
import { MAX_WORDS_HARD, wordCount } from './types';

export type FilterResult = { ok: true; line: string } | { ok: false; reason: string };

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Normalise a generated line and decide whether it may be spoken. Shared by real and mock generators. */
export function postFilter(raw: string, recent: readonly string[]): FilterResult {
  let line = raw
    .replace(EMOJI, '')
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return { ok: false, reason: 'empty' };

  // At most one exclamation mark; turn the rest into full stops.
  let seen = false;
  line = line.replace(/!+/g, () => {
    if (seen) return '.';
    seen = true;
    return '!';
  });

  // No shouting: if several words are in caps, sentence-case them instead of dropping the line.
  const shouty = line.match(/\b[A-Z]{3,}\b/g) ?? [];
  if (shouty.length >= 2) line = line.replace(/\b[A-Z]{3,}\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

  if (wordCount(line) > MAX_WORDS_HARD) return { ok: false, reason: 'too-long' };
  if (lineLooksSensitive(line)) return { ok: false, reason: 'sensitive-output' };
  if (isNearDuplicate(line, recent)) return { ok: false, reason: 'duplicate' };
  return { ok: true, line };
}
