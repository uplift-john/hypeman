import { getRequestListener } from '@hono/node-server';
import { appFromEnv } from './fromEnv';

/**
 * Vercel serverless entry (Build Output API, Node launcher). Bundled by scripts/build-vercel.mjs.
 * A public deployment refuses to run ungated: anyone with the URL could spend the API keys.
 */
const env = process.env;
if (!env.HYPEMAN_ACCESS_CODES && env.HYPEMAN_ALLOW_PUBLIC !== '1') {
  throw new Error('Set HYPEMAN_ACCESS_CODES (and HYPEMAN_SESSION_SECRET) before deploying publicly.');
}
const { app } = appFromEnv(env);

export default getRequestListener(app.fetch);
