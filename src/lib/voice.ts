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

// Browser fallback only (ElevenLabs is the real voice). He's an American guy: US English male
// voices in rough order of naturalness across Edge/Windows, macOS and Chrome. Never British, never female.
const US_MALE = [
  /andrew.*natural/i, /brian.*natural/i, /guy.*natural/i, /christopher.*natural/i, /eric.*natural/i, /roger.*natural/i, /steffan.*natural/i, /davis/i, /tony/i, /jason/i,
  /\baaron\b/i, /\bevan\b/i, /\bnathan\b/i, /\btom\b/i, /\balex\b/i, /\breed\b/i,
  /\b(guy|andrew|brian|christopher|eric|roger|mark|david|james)\b/i,
];

/** The voice we use when the user hasn't picked one. */
export function defaultVoice(): { voice: SpeechSynthesisVoice | undefined; male: boolean } {
  const us = listVoices().filter((v) => /^en[-_]US/i.test(v.lang));
  for (const re of US_MALE) {
    const v = us.find((x) => re.test(x.name) && !/novelty|compact/i.test(x.name));
    if (v) return { voice: v, male: true };
  }
  return { voice: us[0], male: false };
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

let elevenVoiceId: string | null = null;
const speakingListeners = new Set<(speaking: boolean) => void>();

/** Listen mode uses this to stop hearing the room while Hypeman himself is talking. */
export function onSpeakingChange(fn: (speaking: boolean) => void): () => void {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

function setSpeaking(on: boolean) {
  speakingListeners.forEach((l) => l(on));
}
let lastVoiceError: string | null = null;
const errorListeners = new Set<(msg: string) => void>();

/** Fires when the ElevenLabs voice fails, with the server's explanation (never silent). */
export function onVoiceError(fn: (msg: string) => void): () => void {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

export function getLastVoiceError(): string | null {
  return lastVoiceError;
}

function reportVoiceError(msg: string) {
  if (msg === lastVoiceError) return;
  lastVoiceError = msg;
  errorListeners.forEach((l) => l(msg));
}

/** Set from /api/health: 'elevenlabs' when the server has an ElevenLabs key. */
export function setVoiceBackend(b: Backend): void {
  backend = b;
}

export function voiceBackend(): Backend {
  return backend;
}

/** The ElevenLabs voice picked in Settings (null = the server's default). */
export function setElevenVoice(id: string | null): void {
  elevenVoiceId = id;
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
  a.addEventListener('playing', () => setSpeaking(true));
  for (const ev of ['ended', 'pause', 'error']) a.addEventListener(ev, () => setSpeaking(false), { once: true });
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
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, persona, voiceId: elevenVoiceId ?? undefined }) });
      if (res.ok) {
        lastVoiceError = null;
        return await playUrl(URL.createObjectURL(await res.blob()), true);
      }
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      reportVoiceError(b.error ?? `Voice request failed (${res.status}).`);
    } catch (e) {
      // Autoplay refusals are the browser's, not ElevenLabs'; anything else is worth saying.
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) reportVoiceError('Couldn’t reach the voice service.');
    }
  }
  await voicesReady();
  speak(text, voiceURI, persona);
}

/** Browsers load voices lazily; the first call can otherwise land on a random default voice. */
function voicesReady(): Promise<void> {
  if (!voiceSupported() || listVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 1200);
  });
}

/** Play one of Hypeman's recorded clips (the real voice). Falls back to `fallbackText` via TTS. */
export async function playClip(src: string, fallbackText: string, voiceURI: string | null, persona = 'hype'): Promise<void> {
  try {
    await playUrl(src, false);
  } catch (e) {
    if (fallbackText && !(e instanceof DOMException && e.name === 'NotAllowedError')) await say(fallbackText, voiceURI, persona);
  }
}

/** Play an ElevenLabs preview clip (Settings → voice picker). */
export function playPreview(url: string): void {
  void playUrl(url, false).catch(() => {});
}

export function speak(text: string, voiceURI: string | null, persona = 'hype'): void {
  if (!voiceSupported()) return;
  try {
    const synth = window.speechSynthesis;
    const picked = voiceURI ? listVoices().find((x) => x.voiceURI === voiceURI) : undefined;
    const fallback = picked ? { voice: picked, male: true } : defaultVoice();
    const p = PROSODY[persona] ?? PROSODY.hype;

    const utter = (voice: SpeechSynthesisVoice | undefined, male: boolean) => {
      const u = new SpeechSynthesisUtterance(forSpeech(text));
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-US';
      }
      u.rate = p.rate;
      // No US male voice on this device: drop the pitch so at least it doesn't sound like a woman.
      u.pitch = male ? p.pitch : Math.min(p.pitch, 0.7);
      return u;
    };

    const first = utter(fallback.voice, fallback.male);
    // Some listed voices (e.g. macOS voices that aren't downloaded) play nothing. If speech
    // hasn't started shortly, retry with the system's default voice so he's never mute.
    let started = false;
    first.onstart = () => {
      started = true;
      setSpeaking(true);
    };
    first.onend = first.onerror = () => setSpeaking(false);
    const go = () => {
      synth.resume(); // Chrome can leave the queue paused
      synth.speak(first);
      if (fallback.voice) {
        setTimeout(() => {
          if (started) return;
          synth.cancel();
          const retry = utter(undefined, false);
          retry.onstart = () => setSpeaking(true);
          retry.onend = retry.onerror = () => setSpeaking(false);
          setTimeout(() => synth.speak(retry), 60);
        }, 1500);
      }
    };
    // Chrome sometimes drops an utterance queued in the same tick as cancel().
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(go, 60);
    } else {
      go();
    }
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
