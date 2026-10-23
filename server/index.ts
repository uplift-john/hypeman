import { serve } from '@hono/node-server';
import { createApp } from './app';
import { generatorFromEnv } from './generators';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env — that's fine, we run in mock mode.
}

const port = Number(process.env.HYPEMAN_API_PORT ?? 8787);
const webPort = Number(process.env.HYPEMAN_WEB_PORT ?? 5173);
const allowedOrigins = [
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${webPort}`,
  ...(process.env.HYPEMAN_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
];

const generator = generatorFromEnv();
// The request cap is a cost guard for the paid API; mock mode costs nothing, so it's uncapped there.
const app = createApp({ generator, allowedOrigins, maxRequests: generator.mode === 'real' ? 12 : Number.POSITIVE_INFINITY });

// Bind to loopback only: the API key proxy must never be reachable from the network.
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Hypeman API on http://127.0.0.1:${port} — ${generator.mode === 'real' ? `real mode (${generator.model})` : 'mock mode (no ANTHROPIC_API_KEY)'}`);
});
