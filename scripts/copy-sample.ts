/**
 * Prints N mock-mode comments across varied fake screens (incl. blank and sensitive ones),
 * using one session memory per persona — the same path the app uses.
 *   npm run copy-sample            # 30 samples
 *   npm run copy-sample -- 60 7    # 60 samples, rng seed 7
 */
import { remember } from '../shared/dedupe';
import { SCREEN_FIXTURES } from '../shared/fixtures';
import { PERSONA_IDS, type PersonaId } from '../shared/personas';
import { createMockGenerator } from '../server/generators/mock';

const n = Number(process.argv[2] ?? 30);
let seed = Number(process.argv[3] ?? 1);
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const gen = createMockGenerator(rng);
const memory: Record<PersonaId, string[]> = { hype: [], coach: [], bestie: [] };

for (let i = 0; i < n; i++) {
  const f = SCREEN_FIXTURES[i % SCREEN_FIXTURES.length];
  const persona = PERSONA_IDS[Math.floor(i / SCREEN_FIXTURES.length) % PERSONA_IDS.length];
  const r = await gen.generate({ persona, trigger: 'auto', recent: memory[persona], hint: f.title });
  if (r.speak) memory[persona] = remember(memory[persona], r.line);
  console.log(`${String(i + 1).padStart(2)}. [${f.id.padEnd(9)}|${persona.padEnd(6)}] ${r.speak ? r.line : `(silent: ${r.reason})`}`);
}
