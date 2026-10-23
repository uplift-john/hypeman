/**
 * Builds the hosted demo (screenshot input, Claude via the claude.ai page runtime) and
 * folds it into a single artifact page: dist-hosted/hypeman.html.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_HOSTED: '1' } });

const dir = 'dist-hosted/assets';
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8'));
if (js.length !== 1) throw new Error(`expected one JS chunk, got ${js.length}`);

const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');
const page = `<title>Hypeman</title>
<meta name="description" content="A hype man for whatever you're up to: show it a screenshot and it says something kind and specific.">
<style>${safe(css.join('\n'))}</style>
<div id="root"></div>
<script type="module">${safe(js[0])}</script>
`;
writeFileSync('dist-hosted/hypeman.html', page);
console.log(`dist-hosted/hypeman.html — ${(page.length / 1024).toFixed(0)} KB`);
