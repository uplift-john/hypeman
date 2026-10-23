/** Thin wrapper over speechSynthesis. Off by default; never throws. */

export function voiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!voiceSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

export function onVoicesChanged(cb: () => void): () => void {
  if (!voiceSupported()) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', cb);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', cb);
}

/** Per-persona delivery: Hype Man is fast and bright, Coach steady, Bestie playful. */
const PROSODY: Record<string, { rate: number; pitch: number }> = {
  hype: { rate: 1.12, pitch: 1.1 },
  coach: { rate: 0.96, pitch: 0.95 },
  bestie: { rate: 1.08, pitch: 1.2 },
};

// He's Hypeman: prefer male English voices for the browser fallback.
const PREFERRED = /\b(guy|alex|daniel|aaron|fred|tom|david|mark|james|ryan|christopher|eric|andrew|brian)\b|google uk english male|male/i;

/** The voice we use when the user hasn't picked one: a natural-sounding English voice if available. */
export function defaultVoice(): SpeechSynthesisVoice | undefined {
  const voices = listVoices().filter((v) => /^en/i.test(v.lang));
  return voices.find((v) => PREFERRED.test(v.name) && !/compact/i.test(v.name)) ?? voices.find((v) => v.default) ?? voices[0];
}

/** Make hype slang pronounceable: "yessirrrrr" → "yessirr", "gooooo" → "goo". */
export function forSpeech(text: string): string {
  return text.replace(/(\p{L})\1{2,}/gu, '$1$1').replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').trim();
}

/* ── ElevenLabs (via the local server, or a pre-recorded pack in the hosted build) ── */

type Backend = 'elevenlabs' | 'browser';
let backend: Backend = 'browser';
let current: HTMLAudioElement | null = null;
let packLookup: ((key: string) => string | undefined) | null = null;

/** Set from /api/health: 'elevenlabs' when the server has an ElevenLabs key. */
export function setVoiceBackend(b: Backend): void {
  backend = b;
}

/** Hosted build: pre-recorded ElevenLabs clips keyed by `${persona}|${text}`. */
export function setVoicePack(lookup: (key: string) => string | undefined): void {
  packLookup = lookup;
}

function playUrl(url: string, revoke: boolean): Promise<void> {
  stopAudio();
  const a = new Audio(url);
  current = a;
  if (revoke) a.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  return a.play();
}

function stopAudio(): void {
  if (current) {
    current.pause();
    current = null;
  }
}

/**
 * Say a line in Hypeman's voice. Order: pre-recorded clip → ElevenLabs via the server →
 * the browser's built-in voice. Never throws; falls back silently.
 */
export async function say(text: string, voiceURI: string | null, persona = 'hype'): Promise<void> {
  const clip = packLookup?.(`${persona}|${text}`);
  if (clip) {
    try {
      return await playUrl(clip, false);
    } catch {
      // fall through
    }
  }
  if (backend === 'elevenlabs') {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, persona }) });
      if (res.ok) return await playUrl(URL.createObjectURL(await res.blob()), true);
    } catch {
      // fall through to the browser voice
    }
  }
  speak(text, voiceURI, persona);
}

export function speak(text: string, voiceURI: string | null, persona = 'hype'): void {
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    const v = (voiceURI ? listVoices().find((x) => x.voiceURI === voiceURI) : undefined) ?? defaultVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    const p = PROSODY[persona] ?? PROSODY.hype;
    u.rate = p.rate;
    u.pitch = p.pitch;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function stopSpeaking(): void {
  stopAudio();
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
