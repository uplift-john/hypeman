import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { createMockGenerator } from '../../server/generators/mock';
import { DEFAULT_VOICE_ID, createElevenLabsTts, forSpeech, ttsFromEnv, type Tts } from '../../server/tts';
import { recordableLines } from '../../shared/voiceLines';
import { seeded } from './harness';

const ORIGIN = 'http://localhost:5173';
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]).buffer;

function fakeEleven(status = 200) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(status === 200 ? mp3 : '{"detail":"nope"}', { status }));
}

describe('ElevenLabs client', () => {
  it('posts to the text-to-speech endpoint with the key in a header, never the URL', async () => {
    const f = fakeEleven();
    const tts = createElevenLabsTts({ apiKey: 'sk_secret', voiceId: DEFAULT_VOICE_ID, fetch: f as unknown as typeof fetch });
    const audio = await tts.synthesize('Noice!', 'hype');
    expect(audio.byteLength).toBe(6);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain(`/v1/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect(url).not.toContain('sk_secret');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk_secret');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ text: 'Noice!', model_id: 'eleven_multilingual_v2' });
    expect(body.voice_settings.stability).toBeLessThanOrEqual(0.5); // expressive, not monotone
  });

  it('caches repeated lines (saves credits)', async () => {
    const f = fakeEleven();
    const tts = createElevenLabsTts({ apiKey: 'k', voiceId: DEFAULT_VOICE_ID, fetch: f as unknown as typeof fetch });
    await tts.synthesize('Yessir!', 'hype');
    await tts.synthesize('Yessir!', 'hype');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uses ELEVENLABS_VOICE_ID when set; off without a key', () => {
    expect(ttsFromEnv({})).toBeNull();
    expect(ttsFromEnv({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'gymbro123' })?.voiceId).toBe('gymbro123');
    expect(ttsFromEnv({ ELEVENLABS_API_KEY: 'k', HYPEMAN_FORCE_MOCK: '1' })).toBeNull();
  });

  it('makes slang pronounceable', () => {
    expect(forSpeech('Yessirrrrr!')).toBe('Yessirrr!');
    expect(forSpeech("Let's gooooo 🔥")).toBe("Let's gooo.");
  });

  it('every pre-recordable line is placeholder-free, and every persona has a greeting', () => {
    const lines = recordableLines();
    expect(lines.every((l) => !l.text.includes('{'))).toBe(true);
    for (const p of ['hype', 'coach', 'bestie']) expect(lines.some((l) => l.persona === p && /hype man|here/i.test(l.text))).toBe(true);
  });
});

describe('/api/tts', () => {
  const app = (tts: Tts | null) => createApp({ generator: createMockGenerator(seeded(1)), tts, allowedOrigins: [ORIGIN], log: () => {} });
  const post = (a: ReturnType<typeof app>, body: unknown, headers: Record<string, string> = {}) =>
    a.request('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify(body) });

  it('health reports the voice backend', async () => {
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: fakeEleven() as unknown as typeof fetch });
    expect((await (await app(tts).request('/api/health')).json()).voice).toBe('elevenlabs');
    expect((await (await app(null).request('/api/health')).json()).voice).toBe('browser');
  });

  it('returns mp3 audio', async () => {
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: fakeEleven() as unknown as typeof fetch });
    const res = await post(app(tts), { text: 'Noice!', persona: 'hype' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect((await res.arrayBuffer()).byteLength).toBe(6);
  });

  it('404 without a key, so the browser falls back to its own voice', async () => {
    expect((await post(app(null), { text: 'Noice!' })).status).toBe(404);
  });

  it('rejects other origins, empty and over-long text', async () => {
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: fakeEleven() as unknown as typeof fetch });
    expect((await post(app(tts), { text: 'Noice!' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(app(tts), { text: '' })).status).toBe(400);
    expect((await post(app(tts), { text: 'x'.repeat(201) })).status).toBe(400);
  });

  it('upstream failure → clean error without the key', async () => {
    const tts = createElevenLabsTts({ apiKey: 'sk_secret', fetch: fakeEleven(401) as unknown as typeof fetch });
    const res = await post(app(tts), { text: 'Noice!' });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('sk_secret');
  });
});

describe('voice picker', () => {
  const lib = {
    voices: [
      { voice_id: 'GymBroVoice0001', public_owner_id: 'owner000000001', name: 'Chad', accent: 'american', descriptive: 'energetic', use_case: 'social media', preview_url: 'https://x/p.mp3' },
      { voice_id: 'BritVoice000001', public_owner_id: 'owner000000002', name: 'Nigel', accent: 'british', preview_url: 'https://x/n.mp3' },
    ],
  };
  const acct = {
    voices: [
      { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', preview_url: 'https://x/l.mp3', labels: { gender: 'male', accent: 'american', age: 'young' } },
      { voice_id: 'FemaleVoice0001', name: 'Rachel', labels: { gender: 'female' } },
    ],
  };
  function fake() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/shared-voices')) return new Response(JSON.stringify(lib));
      if (url.endsWith('/v1/voices')) return new Response(JSON.stringify(acct));
      if (url.includes('/v1/voices/add/')) return new Response(JSON.stringify({ voice_id: 'AddedVoice00001' }));
      if (url.includes('/v1/text-to-speech/')) return new Response(mp3);
      return new Response('{}', { status: 404, headers: init?.headers as HeadersInit });
    });
  }

  it('lists male voices only, American library voices only, account voices first', async () => {
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: fake() as unknown as typeof fetch });
    const list = await tts.catalog();
    expect(list.map((v) => v.name)).toEqual(['Liam', 'Chad']);
    expect(list[1]).toMatchObject({ ownerId: 'owner000000001', previewUrl: 'https://x/p.mp3' });
  });

  it('adopting a library voice adds it to the account and returns the usable id', async () => {
    const f = fake();
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: f as unknown as typeof fetch });
    expect(await tts.adopt('GymBroVoice0001', 'owner000000001')).toBe('AddedVoice00001');
    await expect(tts.adopt('bad id!', 'owner000000001')).rejects.toThrow();
  });

  it('synthesize uses the picked voice when valid, the default otherwise', async () => {
    const f = fake();
    const tts = createElevenLabsTts({ apiKey: 'k', voiceId: DEFAULT_VOICE_ID, fetch: f as unknown as typeof fetch });
    await tts.synthesize('Noice!', 'hype', undefined, 'AddedVoice00001');
    await tts.synthesize('Noice!', 'hype', undefined, '../../evil');
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/text-to-speech/AddedVoice00001');
    expect(urls[1]).toContain(`/text-to-speech/${DEFAULT_VOICE_ID}`);
  });

  it('with no voice pinned, the default is auto-picked: a library gym-bro voice, added to the account', async () => {
    const f = fake();
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: f as unknown as typeof fetch });
    await tts.synthesize('Noice!', 'hype');
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/voices/add/owner000000001/GymBroVoice0001'))).toBe(true);
    expect(urls.at(-1)).toContain('/text-to-speech/AddedVoice00001');
    expect(tts.voiceId).toBe('AddedVoice00001');
  });

  it('if the account can’t use library voices, it falls back to the premade bro voice instead of going silent', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.includes('/v1/shared-voices')) return new Response(JSON.stringify(lib));
      if (url.endsWith('/v1/voices')) return new Response(JSON.stringify(acct));
      if (url.includes('/v1/voices/add/')) return new Response(JSON.stringify({ voice_id: 'AddedVoice00001' }));
      if (url.includes('/text-to-speech/AddedVoice00001')) return new Response(JSON.stringify({ detail: { status: 'payment_required', message: 'Library voices need a paid plan' } }), { status: 402 });
      return new Response(mp3);
    });
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: f as unknown as typeof fetch });
    expect((await tts.synthesize('Noice!', 'hype')).byteLength).toBe(6);
    expect(String(f.mock.calls.at(-1)![0])).toContain(`/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect(tts.voiceId).toBe(DEFAULT_VOICE_ID); // remembered for next time
  });

  it('check() reports ElevenLabs’ own error message, never the key', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ detail: { status: 'quota_exceeded', message: 'You have 0 credits remaining' } }), { status: 401 }));
    const tts = createElevenLabsTts({ apiKey: 'sk_secret', voiceId: DEFAULT_VOICE_ID, fetch: f as unknown as typeof fetch });
    const r = await tts.check();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/quota_exceeded: You have 0 credits remaining/);
    expect(r.message).not.toContain('sk_secret');
  });

  it('/api/voices requires sign-in on a gated deployment', async () => {
    const { parseAccessCodes } = await import('../../server/auth');
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: fake() as unknown as typeof fetch });
    const app = createApp({ generator: createMockGenerator(seeded(1)), tts, allowedOrigins: [], auth: { codes: parseAccessCodes('a:b'), secret: 's'.repeat(32), secureCookie: false }, log: () => {} });
    expect((await app.request('/api/voices')).status).toBe(401);
    const open = createApp({ generator: createMockGenerator(seeded(1)), tts, allowedOrigins: [], log: () => {} });
    const body = await (await open.request('/api/voices')).json();
    expect(body.voices.length).toBe(2);
  });
});
