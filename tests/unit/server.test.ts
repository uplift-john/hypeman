import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { generatorFromEnv } from '../../server/generators';
import { createMockGenerator } from '../../server/generators/mock';
import { UpstreamError, type Generator } from '../../server/generators/types';
import { seeded } from './harness';

const ORIGIN = 'http://localhost:5173';
const body = (over: Record<string, unknown> = {}) => JSON.stringify({ persona: 'hype', trigger: 'manual', recent: [], hint: 'Q3 Forecast - Google Sheets', ...over });

function app(gen: Generator = createMockGenerator(seeded(1)), extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({ generator: gen, allowedOrigins: [ORIGIN], log: () => {}, ...extra });
}
const post = (a: ReturnType<typeof app>, b: string, headers: Record<string, string> = {}) =>
  a.request('/api/hype', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: b });

describe('server', () => {
  it('runs in mock mode with no API key', async () => {
    expect(generatorFromEnv({}).mode).toBe('mock');
    expect(generatorFromEnv({ ANTHROPIC_API_KEY: '   ' }).mode).toBe('mock');
    expect(generatorFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-x' }).mode).toBe('real');
    expect(generatorFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-x', HYPEMAN_FORCE_MOCK: '1' }).mode).toBe('mock');
    const res = await app().request('/api/health');
    expect(await res.json()).toEqual({ ok: true, mode: 'mock', model: null });
  });

  it('health never exposes the key', async () => {
    const gen = generatorFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-supersecret' });
    const text = await (await app(gen).request('/api/health')).text();
    expect(text).not.toContain('sk-ant');
  });

  it('returns a hype line in mock mode', async () => {
    const res = await post(app(), body());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.speak).toBe(true);
    expect(json.line.length).toBeGreaterThan(0);
    expect(json.context.subject).toBe('Q3 Forecast');
  });

  it('rejects cross-site browser origins (protects the API key)', async () => {
    const res = await post(app(), body(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('rejects non-JSON content types (no CSRF via simple form posts)', async () => {
    const res = await app().request('/api/hype', { method: 'POST', headers: { 'content-type': 'text/plain', origin: ORIGIN }, body: body() });
    expect(res.status).toBe(415);
  });

  it('validates the body', async () => {
    const a = app();
    expect((await post(a, '{nope')).status).toBe(400);
    expect((await post(a, body({ persona: 'villain' }))).status).toBe(400);
    expect((await post(a, body({ recent: 'x' }))).status).toBe(400);
    expect((await post(a, body({ image: 'http://example.com/x.png' }))).status).toBe(400);
    expect((await post(a, body({ trigger: 'cron' }))).status).toBe(400);
  });

  it('rejects oversized images', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(2_100_000);
    const res = await post(app(), body({ image: big }));
    expect([400, 413]).toContain(res.status);
  });

  it('sensitive window title → silence and the generator (and so the frame) is never touched', async () => {
    const gen: Generator = { mode: 'real', model: 'm', generate: vi.fn() };
    const res = await post(app(gen), body({ hint: 'Chase — Account Statement', image: 'data:image/jpeg;base64,AAAA' }));
    expect(await res.json()).toMatchObject({ speak: false, reason: 'sensitive' });
    expect(gen.generate).not.toHaveBeenCalled();
  });

  it('maps upstream failures to clean errors and never leaks details', async () => {
    const failing = (kind: UpstreamError['kind']): Generator => ({
      mode: 'real',
      model: 'm',
      generate: async () => {
        throw new UpstreamError('The model took too long to answer.', kind);
      },
    });
    expect((await post(app(failing('timeout')), body())).status).toBe(504);
    expect((await post(app(failing('rate-limit')), body())).status).toBe(429);
    expect((await post(app(failing('upstream')), body())).status).toBe(502);
    const weird: Generator = { mode: 'real', model: 'm', generate: async () => Promise.reject(new TypeError('secret stack')) };
    const res = await post(app(weird), body());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret stack');
  });

  it('cost guard caps model requests per window', async () => {
    let t = 0;
    const a = app(createMockGenerator(seeded(1)), { maxRequests: 3, now: () => t });
    for (let i = 0; i < 3; i++) expect((await post(a, body())).status).toBe(200);
    expect((await post(a, body())).status).toBe(429);
    t += 600_001;
    expect((await post(a, body())).status).toBe(200);
  });

  it('never logs request bodies or images', async () => {
    const log = vi.fn();
    const gen: Generator = { mode: 'real', model: 'm', generate: async () => Promise.reject(new UpstreamError('x', 'upstream')) };
    await post(app(gen, { log }), body({ image: 'data:image/jpeg;base64,SECRETPIXELS' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRETPIXELS');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Q3 Forecast');
  });

  it('sets no-store on API responses', async () => {
    const res = await app().request('/api/health');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
