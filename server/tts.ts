/**
 * ElevenLabs text-to-speech, server-side only (the key never reaches the browser).
 * Hypeman's voice: an energetic, youthful American guy — set ELEVENLABS_VOICE_ID to
 * override (run `npm run pick-voice` to search the Voice Library for gym-bro voices).
 */

export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
/** Default: "Liam", a premade young, energetic American male voice available on every account. */
export const DEFAULT_VOICE_ID = 'TX3LPaxmHKxFdv7VOQHJ';
// Default is resolved at runtime: a "gym bro" voice from the Voice Library if this account can
// use it, else Liam. ELEVENLABS_VOICE_ID pins one explicitly.
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
  /** `voiceId` overrides the default voice for this call (the user's pick in Settings). */
  synthesize(text: string, persona: string, signal?: AbortSignal, voiceId?: string): Promise<ArrayBuffer>;
  /** Candidate Hypeman voices: young, energetic male voices from the account and the Voice Library. */
  catalog(): Promise<VoiceOption[]>;
  /** Make a Voice Library voice usable by this account; returns the id to synthesize with. */
  adopt(voiceId: string, ownerId: string): Promise<string>;
  /** Live check: synthesize a tiny clip and report exactly what ElevenLabs said. */
  check(): Promise<{ ok: boolean; voiceId: string; message: string }>;
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  previewUrl: string | null;
  /** Set for Voice Library voices that must be added to the account before use. */
  ownerId?: string;
}

export const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** ElevenLabs' own HTTP status, when the error came from them. */
    readonly upstream?: number,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}

export function createElevenLabsTts(opts: { apiKey: string; voiceId?: string; modelId?: string; fetch?: typeof fetch; cacheSize?: number }): Tts {
  const voiceId = opts.voiceId || DEFAULT_VOICE_ID;
  // Library voices first need adding; adopt() handles that (and reports plan limits clearly).
  const modelId = opts.modelId || DEFAULT_MODEL_ID;
  const doFetch = opts.fetch ?? fetch;
  // Lines repeat across sessions ("Noice!"), so cache audio in memory to save credits and latency.
  const cache = new Map<string, ArrayBuffer>();
  const cacheSize = opts.cacheSize ?? 300;
  let catalogCache: { at: number; voices: VoiceOption[] } | null = null;
  /** Auto-picked library "gym bro" voice when ELEVENLABS_VOICE_ID isn't set; Liam if none works. */
  let autoDefault: string | null = opts.voiceId ? opts.voiceId : null;
  let autoPending: Promise<string> | null = null;

  async function tts(voice: string, text: string, persona: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const res = await doFetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': opts.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS[persona] ?? VOICE_SETTINGS.hype }),
      signal,
    });
    if (!res.ok) throw await upstreamError(res);
    return res.arrayBuffer();
  }

  async function defaultVoice(): Promise<string> {
    if (autoDefault) return autoDefault;
    autoPending ??= (async () => {
      try {
        const lib = (await self.catalog()).find((v) => v.ownerId);
        autoDefault = lib ? await self.adopt(lib.id, lib.ownerId!) : DEFAULT_VOICE_ID;
      } catch {
        autoDefault = DEFAULT_VOICE_ID;
      }
      return autoDefault;
    })();
    return autoPending;
  }

  const self: Tts = {
    get voiceId() {
      return autoDefault ?? voiceId;
    },
    async synthesize(text, persona, signal, overrideVoice) {
      const wanted = overrideVoice && VOICE_ID_RE.test(overrideVoice) ? overrideVoice : await defaultVoice();
      const key = `${wanted}|${persona}|${text}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let audio: ArrayBuffer;
      try {
        audio = await tts(wanted, text, persona, signal);
      } catch (err) {
        // A voice this account can't use (e.g. a library voice on a plan without API access to
        // the Voice Library): fall back to the premade bro voice rather than going silent.
        const retryable = err instanceof TtsError && err.upstream !== 401 && err.upstream !== 429 && wanted !== DEFAULT_VOICE_ID;
        if (!retryable) throw err;
        if (wanted === autoDefault) autoDefault = DEFAULT_VOICE_ID;
        audio = await tts(DEFAULT_VOICE_ID, text, persona, signal);
      }
      cache.set(key, audio);
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
      return audio;
    },

    async check() {
      const v = await defaultVoice();
      try {
        await tts(v, 'Yo!', 'hype');
        return { ok: true, voiceId: v, message: v === DEFAULT_VOICE_ID ? 'ElevenLabs is working (premade voice “Liam”).' : 'ElevenLabs is working.' };
      } catch (err) {
        return { ok: false, voiceId: v, message: err instanceof TtsError ? err.message : 'Could not reach ElevenLabs.' };
      }
    },

    async catalog() {
      if (catalogCache && catalogCache.at > Date.now() - 3_600_000) return catalogCache.voices;
      const headers = { 'xi-api-key': opts.apiKey };
      const out: VoiceOption[] = [];
      const seen = new Set<string>();
      const push = (v: VoiceOption) => {
        if (!seen.has(v.id)) {
          seen.add(v.id);
          out.push(v);
        }
      };
      // The voices already on the account (premade + added) that read as male.
      try {
        const r = await doFetch(`${ELEVENLABS_BASE}/v1/voices`, { headers });
        if (r.ok) {
          const { voices } = (await r.json()) as { voices: Array<{ voice_id: string; name: string; preview_url?: string; labels?: Record<string, string>; description?: string }> };
          for (const v of voices) {
            const l = v.labels ?? {};
            if (l.gender && l.gender !== 'male') continue;
            push({ id: v.voice_id, name: v.name, description: [l.accent, l.age, l.description ?? l.descriptive, l.use_case ?? l['use case']].filter(Boolean).join(' · ') || (v.description ?? ''), previewUrl: v.preview_url ?? null });
          }
        }
      } catch {
        // ignore; library search below may still work
      }
      // The Voice Library: young, energetic American guys.
      for (const search of ['gym bro', 'hype man', 'energetic', 'bro']) {
        try {
          const q = new URLSearchParams({ page_size: '8', gender: 'male', age: 'young', language: 'en', search });
          const r = await doFetch(`${ELEVENLABS_BASE}/v1/shared-voices?${q}`, { headers });
          if (!r.ok) continue;
          const { voices } = (await r.json()) as { voices: Array<{ voice_id: string; public_owner_id: string; name: string; accent?: string; descriptive?: string; use_case?: string; description?: string; preview_url?: string }> };
          for (const v of voices) {
            if (v.accent && !/american|us|standard/i.test(v.accent)) continue;
            push({ id: v.voice_id, ownerId: v.public_owner_id, name: v.name, description: [v.accent, v.descriptive, v.use_case].filter(Boolean).join(' · ') || (v.description ?? '').slice(0, 80), previewUrl: v.preview_url ?? null });
          }
        } catch {
          // ignore this query
        }
      }
      catalogCache = { at: Date.now(), voices: out.slice(0, 24) };
      return catalogCache.voices;
    },

    async adopt(id, ownerId) {
      if (!VOICE_ID_RE.test(id) || !/^[A-Za-z0-9]{10,80}$/.test(ownerId)) throw new TtsError('Invalid voice.', 400);
      const r = await doFetch(`${ELEVENLABS_BASE}/v1/voices/add/${ownerId}/${id}`, {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: 'Hypeman' }),
      });
      const body = (await r.json().catch(() => ({}))) as { voice_id?: string; detail?: unknown };
      if (r.ok && body.voice_id) return body.voice_id;
      // Already in the account: the library id works as-is.
      if (/already/i.test(JSON.stringify(body.detail ?? ''))) return id;
      throw new TtsError(`ElevenLabs couldn’t add that voice (${r.status}): ${detailMessage(body)}`, 502, r.status);
    },
  };
  return self;
}

function detailMessage(body: unknown): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === 'string') return d.slice(0, 200);
  if (d && typeof d === 'object') {
    const o = d as { message?: unknown; status?: unknown };
    return [o.status, o.message].filter((x) => typeof x === 'string').join(': ').slice(0, 200);
  }
  return 'no details';
}

/** Turn an ElevenLabs error response into a safe, specific message (never includes the key). */
async function upstreamError(res: Response): Promise<TtsError> {
  const body = await res.json().catch(() => ({}));
  const detail = detailMessage(body);
  const why =
    res.status === 401
      ? 'The ElevenLabs API key was rejected (check ELEVENLABS_API_KEY, and that the key has Text to Speech permission).'
      : res.status === 429
        ? 'ElevenLabs is rate-limiting or your character quota is used up.'
        : `ElevenLabs returned ${res.status}.`;
  return new TtsError(`${why} ${detail !== 'no details' ? `(${detail})` : ''}`.trim(), res.status === 429 ? 429 : 502, res.status);
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
