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

const PREFERRED = /google us english|samantha|aria|jenny|guy|alex|daniel|karen|moira|en-us/i;

/** The voice we use when the user hasn't picked one: a natural-sounding English voice if available. */
export function defaultVoice(): SpeechSynthesisVoice | undefined {
  const voices = listVoices().filter((v) => /^en/i.test(v.lang));
  return voices.find((v) => PREFERRED.test(v.name) && !/compact/i.test(v.name)) ?? voices.find((v) => v.default) ?? voices[0];
}

/** Make hype slang pronounceable: "yessirrrrr" → "yessirr", "gooooo" → "goo". */
export function forSpeech(text: string): string {
  return text.replace(/(\p{L})\1{2,}/gu, '$1$1').replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').trim();
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
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
