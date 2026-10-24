import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_COOKIE, SESSION_DAYS, dayKey, signSession, userForCode, verifySession, type AuthConfig, type Limits } from './auth';
import { isPersonaId } from '../shared/personas';
import { isSensitiveHint, isSensitiveTalk } from '../shared/sensitive';
import { MAX_IMAGE_BYTES, MAX_TRANSCRIPT_CHARS, type HealthResponse, type HypeRequest, type HypeResponse } from '../shared/types';
import { UpstreamError, type Generator } from './generators/types';
import { MAX_TTS_CHARS, TtsError, forSpeech, type Tts } from './tts';

export interface AppOptions {
  generator: Generator;
  /** ElevenLabs voice; null → the browser's built-in speech is used instead. */
  tts?: Tts | null;
  /**
   * Origins allowed to call the API from a browser, in addition to the API's own origin
   * (same-origin is always fine). Requests without an Origin header (curl, tests) are allowed.
   */
  allowedOrigins: string[];
  /** Passcode gate for public deployments; null/undefined = open (local dev). */
  auth?: AuthConfig | null;
  /** Daily caps on paid calls; undefined = no daily caps (local dev). */
  limits?: Limits;
  /** Cost guard: max model requests per rolling window. */
  maxRequests?: number;
  requestWindowMs?: number;
  now?: () => number;
  /** Errors only; never receives request bodies. */
  log?: (msg: string) => void;
}

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

type Parsed = { ok: true; value: HypeRequest } | { ok: false; error: string };

export function parseHypeRequest(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  const b = body as Record<string, unknown>;
  if (!isPersonaId(b.persona)) return { ok: false, error: 'Unknown persona.' };
  if (b.trigger !== 'auto' && b.trigger !== 'manual' && b.trigger !== 'moment') return { ok: false, error: 'Invalid trigger.' };
  if (b.transcript !== undefined && (typeof b.transcript !== 'string' || b.transcript.length > MAX_TRANSCRIPT_CHARS * 2)) return { ok: false, error: 'transcript must be a short string.' };
  if (!Array.isArray(b.recent) || b.recent.some((r) => typeof r !== 'string')) return { ok: false, error: 'recent must be an array of strings.' };
  if (b.hint !== undefined && typeof b.hint !== 'string') return { ok: false, error: 'hint must be a string.' };
  if (b.image !== undefined) {
    if (typeof b.image !== 'string' || !DATA_URL.test(b.image)) return { ok: false, error: 'image must be a base64 data URL (jpeg/png/webp).' };
    // base64 → bytes ≈ 3/4 of the payload length
    if (Math.floor((b.image.length - b.image.indexOf(',') - 1) * 0.75) > MAX_IMAGE_BYTES) return { ok: false, error: 'image too large.' };
  }
  return {
    ok: true,
    value: {
      persona: b.persona,
      trigger: b.trigger,
      recent: (b.recent as string[]).slice(-20).map((r) => r.slice(0, 300)),
      hint: typeof b.hint === 'string' ? b.hint.slice(0, 200) : undefined,
      useClips: b.useClips === true,
      recentClips: Array.isArray(b.recentClips) ? b.recentClips.filter((x): x is string => typeof x === 'string').slice(-20) : [],
      // Keep the most recent part of the conversation.
      transcript: typeof b.transcript === 'string' && b.transcript.trim() ? b.transcript.trim().slice(-MAX_TRANSCRIPT_CHARS) : undefined,
      image: b.image as string | undefined,
    },
  };
}

export function createApp(opts: AppOptions) {
  const { generator, allowedOrigins } = opts;
  const now = opts.now ?? Date.now;
  const maxRequests = opts.maxRequests ?? 12;
  const windowMs = opts.requestWindowMs ?? 600_000;
  const log = opts.log ?? ((m: string) => console.error(m));
  const requestTimes = new Map<string, number[]>();
  const auth = opts.auth ?? null;
  const limits = opts.limits;

  const app = new Hono<{ Variables: { user: string } }>();

  /** Count one paid call against a daily cap; true if still within it. Fails closed if the store is down. */
  async function withinDaily(key: string, max: number): Promise<boolean> {
    if (!limits || !Number.isFinite(max)) return true;
    try {
      return (await limits.store.incr(`${key}:${dayKey(now())}`, 2 * 86_400)) <= max;
    } catch {
      log('[limits] counter store unavailable');
      return false;
    }
  }

  const sameOrigin = (c: Context, origin: string) => {
    try {
      return new URL(origin).host === (c.req.header('x-forwarded-host') ?? c.req.header('host'));
    } catch {
      return false;
    }
  };

  // Browser-origin guard: a random website must not be able to spend the user's API key
  // via a request to localhost. Also requires JSON so cross-site "simple" requests are rejected.
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.includes(origin) && !sameOrigin(c, origin)) return c.json({ error: 'Origin not allowed.' }, 403);
    c.set('user', auth ? (verifySession(getCookie(c, SESSION_COOKIE), auth.secret, now()) ?? '') : 'local');
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/api/health', (c) => {
    const user = c.get('user');
    const res: HealthResponse = {
      ok: true,
      mode: generator.mode,
      model: generator.model,
      voice: opts.tts ? 'elevenlabs' : 'browser',
      auth: { required: !!auth, user: user || null, codesLoaded: auth ? auth.codes.size : 0 },
      env: process.env.VERCEL_ENV,
    };
    return c.json(res);
  });

  /* ── sign in / out ── */

  app.post('/api/login', bodyLimit({ maxSize: 1_000, onError: (c) => c.json({ error: 'Payload too large.' }, 413) }), async (c) => {
    if (!auth) return c.json({ ok: true, user: 'local' });
    const ip = c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    let code = '';
    try {
      const b = (await c.req.json()) as { code?: unknown };
      code = typeof b.code === 'string' ? b.code.trim() : '';
    } catch {
      return c.json({ error: 'Invalid JSON.' }, 400);
    }
    const user = code ? userForCode(auth.codes, code) : null;
    if (!user) {
      // Count only failures, so a typo-prone friend isn't locked out by successful sign-ins.
      if (limits && !(await withinDaily(`login-fail:${ip}:${new Date(now()).getUTCHours()}`, limits.loginPerHour))) {
        return c.json({ error: 'Too many attempts. Try again in an hour.' }, 429);
      }
      return c.json({ error: 'That passcode didn’t work. It’s the part after the colon in HYPEMAN_ACCESS_CODES (e.g. john:THIS-PART).' }, 401);
    }
    setCookie(c, SESSION_COOKIE, signSession(user, auth.secret, now()), {
      httpOnly: true,
      secure: auth.secureCookie,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });
    return c.json({ ok: true, user });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  /* ── everything below costs money: signed-in people only ── */

  app.use('/api/hype', async (c, next) => {
    if (auth && !c.get('user')) return c.json({ error: 'Please sign in.' }, 401);
    await next();
  });
  app.use('/api/tts', async (c, next) => {
    if (auth && !c.get('user')) return c.json({ error: 'Please sign in.' }, 401);
    await next();
  });

  app.post(
    '/api/hype',
    bodyLimit({ maxSize: MAX_IMAGE_BYTES * 1.4 + 20_000, onError: (c) => c.json({ error: 'Payload too large.' }, 413) }),
    async (c) => {
      if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
        return c.json({ error: 'Content-Type must be application/json.' }, 415);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON.' }, 400);
      }
      const parsed = parseHypeRequest(body);
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const req = parsed.value;

      // Sensitive window/tab title or conversation → silence, and nothing is forwarded anywhere.
      if (isSensitiveHint(req.hint) || isSensitiveTalk(req.transcript)) {
        const res: HypeResponse = { speak: false, line: '', reason: 'sensitive', mode: generator.mode };
        return c.json(res);
      }

      // Short-term burst guard, per person.
      const user = c.get('user') || 'anon';
      const t = now();
      const mine = (requestTimes.get(user) ?? []).filter((x) => t - x < windowMs);
      if (mine.length >= maxRequests) {
        return c.json({ error: 'Too many requests — Hypeman is taking a breather.' }, 429);
      }
      mine.push(t);
      requestTimes.set(user, mine);

      // Daily caps only matter when the call costs money.
      if (generator.mode === 'real' && limits) {
        if (!(await withinDaily('hype:all', limits.hypeGlobal))) return c.json({ error: 'Hypeman has hit today’s overall limit. Back tomorrow!' }, 429);
        if (!(await withinDaily(`hype:${user}`, limits.hypePerUser))) return c.json({ error: 'You’ve hit today’s hype limit. Back tomorrow!' }, 429);
      }

      try {
        const res = await generator.generate(req, c.req.raw.signal);
        return c.json(res);
      } catch (err) {
        if (err instanceof UpstreamError) {
          log(`[hype] upstream ${err.kind}`);
          const status = err.kind === 'timeout' ? 504 : err.kind === 'rate-limit' ? 429 : 502;
          return c.json({ error: err.message, kind: err.kind }, status);
        }
        log(`[hype] unexpected ${err instanceof Error ? err.name : 'error'}`);
        return c.json({ error: 'Something went wrong generating a comment.' }, 500);
      }
    },
  );

  app.post('/api/tts', bodyLimit({ maxSize: 4_000, onError: (c) => c.json({ error: 'Payload too large.' }, 413) }), async (c) => {
    const tts = opts.tts;
    if (!tts) return c.json({ error: 'No ElevenLabs key configured; using the browser voice.' }, 404);
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return c.json({ error: 'Content-Type must be application/json.' }, 415);
    }
    let body: { text?: unknown; persona?: unknown; voiceId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON.' }, 400);
    }
    const raw = typeof body.text === 'string' ? body.text : '';
    const text = raw.length <= MAX_TTS_CHARS ? forSpeech(raw) : '';
    if (!text) return c.json({ error: 'text must be 1–200 characters.' }, 400);
    const persona = isPersonaId(body.persona) ? body.persona : 'hype';
    if (limits) {
      const user = c.get('user') || 'anon';
      if (!(await withinDaily('tts:all', limits.ttsGlobal)) || !(await withinDaily(`tts:${user}`, limits.ttsPerUser))) {
        return c.json({ error: 'Voice limit reached for today.' }, 429);
      }
    }
    try {
      const audio = await tts.synthesize(text, persona, c.req.raw.signal, typeof body.voiceId === 'string' ? body.voiceId : undefined);
      return c.body(audio, 200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
    } catch (err) {
      log(`[tts] ${err instanceof TtsError ? err.status : 'error'}`);
      return c.json({ error: err instanceof TtsError ? err.message : 'Voice generation failed.' }, err instanceof TtsError && err.status === 429 ? 429 : 502);
    }
  });

  /* ── voice picker ── */

  app.use('/api/voices', async (c, next) => {
    if (auth && !c.get('user')) return c.json({ error: 'Please sign in.' }, 401);
    await next();
  });
  app.use('/api/voices/*', async (c, next) => {
    if (auth && !c.get('user')) return c.json({ error: 'Please sign in.' }, 401);
    await next();
  });

  app.get('/api/voices', async (c) => {
    if (!opts.tts) return c.json({ error: 'No ElevenLabs key configured.' }, 404);
    try {
      return c.json({ defaultVoiceId: opts.tts.voiceId, voices: await opts.tts.catalog() });
    } catch {
      return c.json({ error: 'Couldn’t load voices from ElevenLabs.' }, 502);
    }
  });

  app.get('/api/voices/check', async (c) => {
    if (!opts.tts) return c.json({ ok: false, message: 'ELEVENLABS_API_KEY isn’t set on the server, so the browser voice is used.' });
    return c.json(await opts.tts.check());
  });

  app.post('/api/voices/adopt', bodyLimit({ maxSize: 1_000, onError: (c) => c.json({ error: 'Payload too large.' }, 413) }), async (c) => {
    if (!opts.tts) return c.json({ error: 'No ElevenLabs key configured.' }, 404);
    let b: { voiceId?: unknown; ownerId?: unknown };
    try {
      b = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON.' }, 400);
    }
    if (typeof b.voiceId !== 'string' || typeof b.ownerId !== 'string') return c.json({ error: 'voiceId and ownerId required.' }, 400);
    try {
      return c.json({ voiceId: await opts.tts.adopt(b.voiceId, b.ownerId) });
    } catch (err) {
      return c.json({ error: err instanceof TtsError ? err.message : 'Couldn’t add that voice.' }, 502);
    }
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}
