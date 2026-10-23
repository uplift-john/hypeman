import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { authFromEnv, limitsFromEnv, memoryStore, parseAccessCodes, signSession, upstashStore, userForCode, verifySession, type Limits } from '../../server/auth';
import { createMockGenerator } from '../../server/generators/mock';
import type { Generator } from '../../server/generators/types';
import { seeded } from './harness';

const SECRET = 's'.repeat(32);
const DAY = 86_400_000;

describe('passcodes and sessions', () => {
  it('parses name:code pairs and bare codes', () => {
    const m = parseAccessCodes(' john:abc123 , sam:xyz ,solo-code, bad name:zzz');
    expect([...m.entries()]).toEqual([
      ['abc123', 'john'],
      ['xyz', 'sam'],
      ['solo-code', 'guest'],
    ]);
    expect(userForCode(m, 'xyz')).toBe('sam');
    expect(userForCode(m, 'xy')).toBeNull();
    // forgiving input: the whole pair, stray spaces, quotes
    expect(userForCode(m, 'sam:xyz')).toBe('sam');
    expect(userForCode(m, '  xyz ')).toBe('sam');
    expect(userForCode(m, 'john:xyz')).toBeNull();
    const quoted = parseAccessCodes('"john:hype-me-up, sam:yo"');
    expect(userForCode(quoted, 'hype-me-up')).toBe('john');
    expect(userForCode(quoted, 'yo')).toBe('sam');
  });

  it('signed sessions verify, expire after 30 days, and resist tampering', () => {
    const t = Date.UTC(2026, 9, 1);
    const tok = signSession('john', SECRET, t);
    expect(verifySession(tok, SECRET, t + 1000)).toBe('john');
    expect(verifySession(tok, SECRET, t + 31 * DAY)).toBeNull();
    expect(verifySession(tok.replace('john', 'sam'), SECRET, t)).toBeNull();
    expect(verifySession(tok, 'other-secret-other-secret', t)).toBeNull();
    expect(verifySession('garbage', SECRET, t)).toBeNull();
  });

  it('requires a strong session secret when codes are set; off without codes', () => {
    expect(authFromEnv({})).toBeNull();
    expect(() => authFromEnv({ HYPEMAN_ACCESS_CODES: 'a:b' })).toThrow(/SESSION_SECRET/);
    expect(authFromEnv({ HYPEMAN_ACCESS_CODES: 'a:b', HYPEMAN_SESSION_SECRET: SECRET, VERCEL: '1' })?.secureCookie).toBe(true);
  });

  it('Upstash counter store speaks the REST pipeline protocol', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ result: 3 }, { result: 1 }])));
    const store = upstashStore('https://kv.example/', 'tok', f as unknown as typeof fetch);
    expect(await store.incr('hype:john:2026-10-23', 172800)).toBe(3);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://kv.example/pipeline');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))[0]).toEqual(['INCR', 'hype:john:2026-10-23']);
    expect(limitsFromEnv({ KV_REST_API_URL: 'https://kv', KV_REST_API_TOKEN: 't' }).store).toBeDefined();
  });
});

describe('gated app', () => {
  const realGen: Generator = { mode: 'real', model: 'm', generate: async () => ({ speak: true, line: `Noice ${Math.random()}`, reason: 'ok', mode: 'real' }) };
  function gated(gen: Generator = createMockGenerator(seeded(1)), limits?: Partial<Limits>, now = () => Date.UTC(2026, 9, 23, 12)) {
    return createApp({
      generator: gen,
      allowedOrigins: [],
      auth: { codes: parseAccessCodes('john:open-sesame,sam:xyz'), secret: SECRET, secureCookie: true },
      limits: { store: memoryStore(now), hypePerUser: 3, ttsPerUser: 5, hypeGlobal: 5, ttsGlobal: 10, loginPerHour: 3, ...limits },
      maxRequests: Infinity,
      now,
      log: () => {},
    });
  }
  const H = { 'content-type': 'application/json', host: 'hype.example', origin: 'https://hype.example' };
  const hypeBody = JSON.stringify({ persona: 'hype', trigger: 'manual', recent: [], image: 'data:image/jpeg;base64,AAAA' });
  async function login(app: ReturnType<typeof gated>, code: string) {
    const r = await app.request('/api/login', { method: 'POST', headers: H, body: JSON.stringify({ code }) });
    return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }

  it('paid endpoints need a session; health says sign-in is required', async () => {
    const app = gated();
    expect((await app.request('/api/hype', { method: 'POST', headers: H, body: hypeBody })).status).toBe(401);
    expect((await app.request('/api/tts', { method: 'POST', headers: H, body: '{"text":"hi"}' })).status).toBe(401);
    expect(await (await app.request('/api/health', { headers: H })).json()).toMatchObject({ auth: { required: true, user: null } });
  });

  it('a correct passcode signs in with a secure HttpOnly cookie', async () => {
    const app = gated();
    const r = await app.request('/api/login', { method: 'POST', headers: H, body: '{"code":"open-sesame"}' });
    const set = r.headers.get('set-cookie') ?? '';
    expect(r.status).toBe(200);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Lax/);
    const cookie = set.split(';')[0];
    expect(await (await app.request('/api/health', { headers: { ...H, cookie } })).json()).toMatchObject({ auth: { user: 'john' } });
    expect((await app.request('/api/hype', { method: 'POST', headers: { ...H, cookie }, body: hypeBody })).status).toBe(200);
  });

  it('same-origin requests on the deployment are allowed; other sites are not', async () => {
    const app = gated();
    const { cookie } = await login(app, 'open-sesame');
    expect((await app.request('/api/hype', { method: 'POST', headers: { ...H, cookie, origin: 'https://evil.example' }, body: hypeBody })).status).toBe(403);
  });

  it('wrong passcodes are rate-limited per IP', async () => {
    const app = gated();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await app.request('/api/login', { method: 'POST', headers: { ...H, 'x-real-ip': '1.2.3.4' }, body: '{"code":"nope"}' })).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('per-person daily cap, then an overall daily ceiling', async () => {
    const app = gated(realGen);
    const john = (await login(app, 'open-sesame')).cookie;
    const sam = (await login(app, 'xyz')).cookie;
    const hype = (cookie: string) => Promise.resolve(app.request('/api/hype', { method: 'POST', headers: { ...H, cookie }, body: hypeBody })).then((r) => r.status);
    expect([await hype(john), await hype(john), await hype(john), await hype(john)]).toEqual([200, 200, 200, 429]);
    // Overall ceiling is 5: john's 4 attempts counted toward it, so sam gets one before it closes.
    expect([await hype(sam), await hype(sam)]).toEqual([200, 429]);
  });

  it('daily caps reset the next UTC day', async () => {
    let t = Date.UTC(2026, 9, 23, 23);
    const app = gated(realGen, {}, () => t);
    const { cookie } = await login(app, 'open-sesame');
    const hype = () => Promise.resolve(app.request('/api/hype', { method: 'POST', headers: { ...H, cookie }, body: hypeBody })).then((r) => r.status);
    for (let i = 0; i < 3; i++) await hype();
    expect(await hype()).toBe(429);
    t += 2 * 3_600_000;
    expect(await hype()).toBe(200);
  });

  it('mock mode costs nothing, so it is not daily-capped', async () => {
    const app = gated();
    const { cookie } = await login(app, 'open-sesame');
    for (let i = 0; i < 10; i++) expect((await app.request('/api/hype', { method: 'POST', headers: { ...H, cookie }, body: hypeBody })).status).toBe(200);
  });

  it('fails closed if the counter store is down', async () => {
    const app = gated(realGen, { store: { incr: async () => Promise.reject(new Error('down')) } });
    const { cookie } = await login(app, 'open-sesame');
    expect((await app.request('/api/hype', { method: 'POST', headers: { ...H, cookie }, body: hypeBody })).status).toBe(429);
  });

  it('logout clears the cookie', async () => {
    const r = await gated().request('/api/logout', { method: 'POST', headers: H });
    expect(r.headers.get('set-cookie')).toMatch(/hm_session=;/);
  });
});

describe('vercel entry', () => {
  it('without a passcode gate it serves no paid endpoints and explains the misconfiguration', async () => {
    const prev = { ...process.env };
    delete process.env.HYPEMAN_ACCESS_CODES;
    delete process.env.HYPEMAN_ALLOW_PUBLIC;
    process.env.VERCEL_ENV = 'preview';
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: listener } = await import('../../server/vercel');
    const http = await import('node:http');
    const srv = http.createServer(listener).listen(0);
    const port = (srv.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/hype`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/HYPEMAN_ACCESS_CODES.*preview/);
    srv.close();
    errSpy.mockRestore();
    process.env = prev;
  });
});
