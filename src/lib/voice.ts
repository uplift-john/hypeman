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

export function speak(text: string, voiceURI: string | null): void {
  if (!voiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceURI ? listVoices().find((x) => x.voiceURI === voiceURI) : undefined;
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = 1.02;
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
