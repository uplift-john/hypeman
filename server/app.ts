import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isPersonaId } from '../shared/personas';
import { isSensitiveHint } from '../shared/sensitive';
import { MAX_IMAGE_BYTES, type HealthResponse, type HypeRequest, type HypeResponse } from '../shared/types';
import { UpstreamError, type Generator } from './generators/types';
import { MAX_TTS_CHARS, TtsError, forSpeech, type Tts } from './tts';

export interface AppOptions {
  generator: Generator;
  /** ElevenLabs voice; null → the browser's built-in speech is used instead. */
  tts?: Tts | null;
  /** Origins allowed to call the API from a browser. Requests without an Origin header (curl, tests) are allowed. */
  allowedOrigins: string[];
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
  if (b.trigger !== 'auto' && b.trigger !== 'manual') return { ok: false, error: 'Invalid trigger.' };
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
  let requestTimes: number[] = [];

  const app = new Hono();

  // Browser-origin guard: a random website must not be able to spend the user's API key
  // via a request to localhost. Also requires JSON so cross-site "simple" requests are rejected.
  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.includes(origin)) return c.json({ error: 'Origin not allowed.' }, 403);
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/api/health', (c) => {
    const res: HealthResponse = { ok: true, mode: generator.mode, model: generator.model, voice: opts.tts ? 'elevenlabs' : 'browser' };
    return c.json(res);
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

      // Sensitive window/tab title → silence, and the frame is never forwarded anywhere.
      if (isSensitiveHint(req.hint)) {
        const res: HypeResponse = { speak: false, line: '', reason: 'sensitive', mode: generator.mode };
        return c.json(res);
      }

      const t = now();
      requestTimes = requestTimes.filter((x) => t - x < windowMs);
      if (requestTimes.length >= maxRequests) {
        return c.json({ error: 'Too many requests — Hypeman is taking a breather.' }, 429);
      }
      requestTimes.push(t);

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
    let body: { text?: unknown; persona?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON.' }, 400);
    }
    const raw = typeof body.text === 'string' ? body.text : '';
    const text = raw.length <= MAX_TTS_CHARS ? forSpeech(raw) : '';
    if (!text) return c.json({ error: 'text must be 1–200 characters.' }, 400);
    const persona = isPersonaId(body.persona) ? body.persona : 'hype';
    try {
      const audio = await tts.synthesize(text, persona, c.req.raw.signal);
      return c.body(audio, 200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
    } catch (err) {
      log(`[tts] ${err instanceof TtsError ? err.status : 'error'}`);
      return c.json({ error: err instanceof TtsError ? err.message : 'Voice generation failed.' }, err instanceof TtsError && err.status === 429 ? 429 : 502);
    }
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}
