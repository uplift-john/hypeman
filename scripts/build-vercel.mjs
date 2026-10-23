/**
 * Builds Hypeman for Vercel using the Build Output API (.vercel/output):
 *   static/                     ← the Vite frontend (dist/)
 *   functions/api/index.func/   ← the whole Hono API bundled into one Node function
 * Vercel runs this via vercel.json's buildCommand.
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });

execSync('npx vite build', { stdio: 'inherit' });
mkdirSync(`${out}/static`, { recursive: true });
cpSync('dist', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api/index.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['server/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: `${fn}/index.mjs`,
  // Some deps still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2));
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/(.*)$', dest: '/api/index' },
        {
          src: '^/(.*)$',
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Permissions-Policy': 'display-capture=(self), camera=(), microphone=(), geolocation=()',
          },
          continue: true,
        },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Vercel build output ready in .vercel/output');
