/**
 * Searches the ElevenLabs Voice Library for an energetic, youthful "gym bro" male voice and
 * prints candidates with preview links. Add one to your account with --add <public_owner_id> <voice_id>,
 * then set ELEVENLABS_VOICE_ID to the returned id.
 *   npx tsx scripts/pick-voice.ts
 *   npx tsx scripts/pick-voice.ts --add <public_owner_id> <voice_id>
 */
import { ELEVENLABS_BASE } from '../server/tts';

try {
  process.loadEnvFile('.env');
} catch {
  // ok
}
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}
const headers = { 'xi-api-key': key };

if (process.argv[2] === '--add') {
  const [owner, voice] = process.argv.slice(3);
  const res = await fetch(`${ELEVENLABS_BASE}/v1/voices/add/${owner}/${voice}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ new_name: 'Hypeman' }),
  });
  console.log(res.status, await res.text());
  process.exit(res.ok ? 0 : 1);
}

type SharedVoice = { name: string; voice_id: string; public_owner_id: string; accent?: string; age?: string; descriptive?: string; use_case?: string; description?: string; preview_url?: string; cloned_by_count?: number };
const seen = new Set<string>();
for (const search of ['gym bro', 'hype man', 'energetic bro', 'hype', 'bro']) {
  const url = `${ELEVENLABS_BASE}/v1/shared-voices?page_size=8&gender=male&age=young&language=en&search=${encodeURIComponent(search)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(search, res.status, await res.text());
    continue;
  }
  const { voices } = (await res.json()) as { voices: SharedVoice[] };
  for (const v of voices) {
    if (seen.has(v.voice_id)) continue;
    seen.add(v.voice_id);
    console.log(`${v.name} — ${[v.accent, v.age, v.descriptive, v.use_case].filter(Boolean).join(', ')} (used ${v.cloned_by_count ?? 0}×)`);
    console.log(`   ${(v.description ?? '').slice(0, 140)}`);
    console.log(`   preview: ${v.preview_url}\n   add:     npx tsx scripts/pick-voice.ts --add ${v.public_owner_id} ${v.voice_id}\n`);
  }
}
