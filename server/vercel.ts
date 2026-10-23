import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { appFromEnv } from './fromEnv';

/**
 * Vercel serverless entry (Build Output API, Node launcher). Bundled by scripts/build-vercel.mjs.
 * A public deployment refuses to serve paid endpoints ungated: anyone with the URL could spend
 * the API keys. Misconfiguration is reported clearly instead of crashing the function.
 */
function build() {
  const env = process.env;
  const missing: string[] = [];
  if (!env.HYPEMAN_ACCESS_CODES?.trim() && env.HYPEMAN_ALLOW_PUBLIC !== '1') missing.push('HYPEMAN_ACCESS_CODES');
  if (env.HYPEMAN_ACCESS_CODES?.trim() && (env.HYPEMAN_SESSION_SECRET?.trim().length ?? 0) < 16) missing.push('HYPEMAN_SESSION_SECRET (16+ characters)');
  if (missing.length === 0) {
    try {
      return appFromEnv(env).app;
    } catch (err) {
      missing.push(err instanceof Error ? err.message : 'invalid configuration');
    }
  }
  const scope = env.VERCEL_ENV ? ` for the "${env.VERCEL_ENV}" environment` : '';
  const message = `Hypeman isn't configured${scope}: set ${missing.join(' and ')} in Vercel → Settings → Environment Variables (tick ${env.VERCEL_ENV ?? 'this'} environment), then redeploy.`;
  console.error(message);
  const fallback = new Hono();
  fallback.all('/api/*', (c) => c.json({ error: message, configError: true }, 503));
  return fallback;
}

const app = build();
export default getRequestListener(app.fetch);
