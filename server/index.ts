import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { appFromEnv } from './fromEnv';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env — that's fine, we run in mock mode.
}

const { app, generator, tts, auth } = appFromEnv();

// `npm start` (e.g. on Railway/Render/Fly): also serve the built frontend from dist/.
const serveFrontend = process.argv.includes('--static') && existsSync('dist/index.html');
if (serveFrontend) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

// Local dev binds to loopback only: the API-key proxy must never be reachable from the network.
// A public deployment must be gated (HYPEMAN_ACCESS_CODES), and only then listens on all interfaces.
const port = Number(process.env.PORT ?? process.env.HYPEMAN_API_PORT ?? 8787);
const hostname = auth && serveFrontend ? '0.0.0.0' : '127.0.0.1';

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(
    `Hypeman ${serveFrontend ? 'app' : 'API'} on http://${hostname}:${port} — ${generator.mode === 'real' ? `real mode (${generator.model})` : 'mock mode (no ANTHROPIC_API_KEY)'}; ` +
      `voice: ${tts ? `ElevenLabs (${tts.voiceId})` : 'browser speech'}; access: ${auth ? `passcode (${auth.codes.size} code${auth.codes.size === 1 ? '' : 's'})` : 'open (local only)'}`,
  );
});
