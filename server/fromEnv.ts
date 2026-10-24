import { createApp } from './app';
import { authFromEnv, limitsFromEnv } from './auth';
import { generatorFromEnv } from './generators';
import { ttsFromEnv } from './tts';

/** Builds the API from environment variables — shared by the local server and the Vercel function. */
export function appFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const webPort = Number(env.HYPEMAN_WEB_PORT ?? 5173);
  const allowedOrigins = [
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
    ...(env.HYPEMAN_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  ];
  const generator = generatorFromEnv(env);
  const tts = ttsFromEnv(env);
  const auth = authFromEnv(env);
  // Daily caps apply whenever the deployment is gated (i.e. public); local dev stays uncapped.
  const limits = auth ? limitsFromEnv(env) : undefined;
  const app = createApp({
    generator,
    tts,
    auth,
    limits,
    allowedOrigins,
    // Short-term burst guard per person; mock mode costs nothing, so it's uncapped there.
    maxRequests: generator.mode === 'real' ? 30 : Number.POSITIVE_INFINITY,
  });
  return { app, generator, tts, auth };
}
