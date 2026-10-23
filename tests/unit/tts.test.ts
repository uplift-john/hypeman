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
    const tts = createElevenLabsTts({ apiKey: 'sk_secret', fetch: f as unknown as typeof fetch });
    const audio = await tts.synthesize('Noice!', 'hype');
    expect(audio.byteLength).toBe(6);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain(`/v1/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect(url).not.toContain('sk_secret');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk_secret');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ text: 'Noice!', model_id: 'eleven_flash_v2_5' });
    expect(body.voice_settings.stability).toBeLessThan(0.5); // energetic delivery
  });

  it('caches repeated lines (saves credits)', async () => {
    const f = fakeEleven();
    const tts = createElevenLabsTts({ apiKey: 'k', fetch: f as unknown as typeof fetch });
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
    expect(forSpeech('Yessirrrrr!')).toBe('Yessirr!');
    expect(forSpeech("Let's gooooo 🔥")).toBe("Let's goo");
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
