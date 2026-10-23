import { MOCK_LINES } from './mockLines';
import { GREETINGS, PERSONA_IDS, type PersonaId } from './personas';

/** Lines that can be pre-recorded: no {placeholders}. Keyed `${persona}|${text}`. */
export function recordableLines(): Array<{ persona: PersonaId; text: string }> {
  const out: Array<{ persona: PersonaId; text: string }> = [];
  for (const p of PERSONA_IDS) {
    out.push({ persona: p, text: GREETINGS[p] }, { persona: p, text: 'Sound on!' }, { persona: p, text: 'Noice! I see what you did there, and I like it.' });
  }
  for (const l of MOCK_LINES) if (!/\{/.test(l.text)) out.push({ persona: l.persona, text: l.text });
  return out;
}

export const packKey = (persona: string, text: string) => `${persona}|${text}`;
