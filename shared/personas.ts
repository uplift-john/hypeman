export type PersonaId = 'hype' | 'coach' | 'bestie';

export interface Persona {
  id: PersonaId;
  name: string;
  tagline: string;
  /** Tone guidance only — never changes the rules. */
  tone: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  hype: {
    id: 'hype',
    name: 'Hype Man',
    tagline: 'High energy, big belief',
    tone: 'High energy and confident, like a friend who just watched you do something impressive. Punchy rhythm, vivid verbs. Excited, never shouting: no ALL CAPS, at most one exclamation mark.',
  },
  coach: {
    id: 'coach',
    name: 'Coach',
    tagline: 'Calm, steady, grounded',
    tone: 'Calm, steady and grounded, like a good coach noticing real progress. Plain words, measured pace, quietly proud. No exclamation marks.',
  },
  bestie: {
    id: 'bestie',
    name: 'Bestie',
    tagline: 'Playful, warm, a little cheeky',
    tone: 'Playful and warm, like your best friend peeking over your shoulder. Light teasing in your favour only, a little whimsy, genuinely delighted. Never sarcastic.',
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && v in PERSONAS;
}

/** Said out loud when a session starts: proves the sound works and unlocks audio. */
export const GREETINGS: Record<PersonaId, string> = {
  hype: 'Yessir! Hype man in the house.',
  coach: 'Alright, I’m here. Let’s have a good one.',
  bestie: 'Hiii! I’m here and ready to cheer.',
};
