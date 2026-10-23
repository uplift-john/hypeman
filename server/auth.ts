import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Access gate for a public deployment: people sign in with a passcode, get a signed
 * HttpOnly session cookie, and every paid call (Claude, ElevenLabs) is counted against
 * per-person and overall daily caps. Off when no codes are configured (local dev).
 */

export const SESSION_COOKIE = 'hm_session';
export const SESSION_DAYS = 30;

/**
 * HYPEMAN_ACCESS_CODES="john:correct-horse,sam:battery-staple" — name:code pairs.
 * A bare code ("letmein") signs in as "guest".
 */
export function parseAccessCodes(raw: string | undefined): Map<string, string> {
  const codes = new Map<string, string>();
  for (const part of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf(':');
    const [user, code] = i === -1 ? ['guest', part] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    if (code && /^[\w.-]{1,40}$/.test(user)) codes.set(code, user);
  }
  return codes;
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Constant-time lookup so codes can't be guessed by timing. */
export function userForCode(codes: Map<string, string>, given: string): string | null {
  let found: string | null = null;
  for (const [code, user] of codes) if (safeEqual(code, given)) found = user;
  return found;
}

export function signSession(user: string, secret: string, nowMs: number): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_DAYS * 86_400;
  const payload = `${user}.${exp}`;
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(token: string | undefined, secret: string, nowMs: number): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  if (!safeEqual(sig, hmac(secret, `${user}.${exp}`))) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < nowMs) return null;
  return user;
}

/* ───────────── usage counters (daily caps) ───────────── */

export interface CounterStore {
  /** Increment and return the new value; the key expires after `ttlSec`. */
  incr(key: string, ttlSec: number): Promise<number>;
}

/** Per-process counters. Fine locally; on serverless each instance counts separately — use Upstash there. */
export function memoryStore(now: () => number = Date.now): CounterStore {
  const m = new Map<string, { n: number; exp: number }>();
  return {
    async incr(key, ttlSec) {
      const t = now();
      const e = m.get(key);
      const next = e && e.exp > t ? { n: e.n + 1, exp: e.exp } : { n: 1, exp: t + ttlSec * 1000 };
      m.set(key, next);
      return next.n;
    },
  };
}

/** Upstash Redis over its REST API (works from Vercel functions; no SDK needed). */
export function upstashStore(url: string, token: string, doFetch: typeof fetch = fetch): CounterStore {
  return {
    async incr(key, ttlSec) {
      const res = await doFetch(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, String(ttlSec), 'NX'],
        ]),
      });
      if (!res.ok) throw new Error(`counter store ${res.status}`);
      const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
      const n = Number(out[0]?.result);
      if (!Number.isFinite(n)) throw new Error('counter store bad reply');
      return n;
    },
  };
}

export interface Limits {
  store: CounterStore;
  /** Claude requests per person per UTC day. */
  hypePerUser: number;
  /** ElevenLabs requests per person per UTC day. */
  ttsPerUser: number;
  /** Claude requests per UTC day across everyone — the spending ceiling. */
  hypeGlobal: number;
  /** ElevenLabs requests per UTC day across everyone. */
  ttsGlobal: number;
  /** Failed sign-ins per IP per hour. */
  loginPerHour: number;
}

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export interface AuthConfig {
  codes: Map<string, string>;
  secret: string;
  /** Set the Secure cookie flag (true on https deployments). */
  secureCookie: boolean;
}

export function authFromEnv(env: NodeJS.ProcessEnv): AuthConfig | null {
  const codes = parseAccessCodes(env.HYPEMAN_ACCESS_CODES);
  if (codes.size === 0) return null;
  const secret = env.HYPEMAN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) throw new Error('HYPEMAN_SESSION_SECRET (16+ chars) is required when HYPEMAN_ACCESS_CODES is set.');
  return { codes, secret, secureCookie: env.NODE_ENV === 'production' || !!env.VERCEL };
}

export function limitsFromEnv(env: NodeJS.ProcessEnv): Limits {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return {
    store: url && token ? upstashStore(url, token) : memoryStore(),
    hypePerUser: num(env.HYPEMAN_DAILY_HYPES_PER_USER, 150),
    ttsPerUser: num(env.HYPEMAN_DAILY_VOICE_PER_USER, 300),
    hypeGlobal: num(env.HYPEMAN_DAILY_HYPES_TOTAL, 1500),
    ttsGlobal: num(env.HYPEMAN_DAILY_VOICE_TOTAL, 3000),
    loginPerHour: 20,
  };
}
