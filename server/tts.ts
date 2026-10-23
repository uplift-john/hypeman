/**
 * ElevenLabs text-to-speech, server-side only (the key never reaches the browser).
 * Hypeman's voice: an energetic, youthful American guy — set ELEVENLABS_VOICE_ID to
 * override (run `npm run pick-voice` to search the Voice Library for gym-bro voices).
 */

export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
/** Default: "Liam", a premade young, energetic American male voice available on every account. */
export const DEFAULT_VOICE_ID = 'TX3LPaxmHKxFdv7VOQHJ';
/** Flash: lowest latency, good for one-breath reactions. */
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
export const MAX_TTS_CHARS = 200;

/** Low stability + high style = more excitable, hype-man delivery. Per persona. */
export const VOICE_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number }> = {
  hype: { stability: 0.3, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true, speed: 1.08 },
  coach: { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 0.98 },
  bestie: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true, speed: 1.05 },
};

export interface Tts {
  voiceId: string;
  synthesize(text: string, persona: string, signal?: AbortSignal): Promise<ArrayBuffer>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}

export function createElevenLabsTts(opts: { apiKey: string; voiceId?: string; modelId?: string; fetch?: typeof fetch; cacheSize?: number }): Tts {
  const voiceId = opts.voiceId || DEFAULT_VOICE_ID;
  const modelId = opts.modelId || DEFAULT_MODEL_ID;
  const doFetch = opts.fetch ?? fetch;
  // Lines repeat across sessions ("Noice!"), so cache audio in memory to save credits and latency.
  const cache = new Map<string, ArrayBuffer>();
  const cacheSize = opts.cacheSize ?? 300;

  return {
    voiceId,
    async synthesize(text, persona, signal) {
      const key = `${persona}|${text}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const res = await doFetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS[persona] ?? VOICE_SETTINGS.hype }),
        signal,
      });
      if (!res.ok) {
        const status = res.status === 401 || res.status === 403 ? 502 : res.status === 429 ? 429 : 502;
        throw new TtsError(res.status === 401 ? 'The ElevenLabs API key was rejected.' : `ElevenLabs returned an error (${res.status}).`, status);
      }
      const audio = await res.arrayBuffer();
      cache.set(key, audio);
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
      return audio;
    },
  };
}

export function ttsFromEnv(env: NodeJS.ProcessEnv = process.env): Tts | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey || env.HYPEMAN_FORCE_MOCK === '1') return null;
  return createElevenLabsTts({ apiKey, voiceId: env.ELEVENLABS_VOICE_ID?.trim(), modelId: env.ELEVENLABS_MODEL_ID?.trim() });
}

/** Pronounceable hype: collapse stretched letters ("yessirrrrr" → "yessirr"), strip emoji. */
export function forSpeech(text: string): string {
  return text.replace(/(\p{L})\1{2,}/gu, '$1$1').replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '').trim();
}
