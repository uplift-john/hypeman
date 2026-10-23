/**
 * Pre-records every placeholder-free line in Hypeman's ElevenLabs voice for the hosted build
 * (which can't call ElevenLabs at runtime). Writes voice-pack/pack.json: { "<persona>|<text>": "data:audio/mpeg;base64,…" }.
 *   ELEVENLABS_API_KEY=… [ELEVENLABS_VOICE_ID=…] npx tsx scripts/render-voice-pack.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElevenLabsTts, forSpeech } from '../server/tts';
import { packKey, recordableLines } from '../shared/voiceLines';

try {
  process.loadEnvFile('.env');
} catch {
  // env vars may come from the environment instead
}
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY (in .env or the environment) first.');
  process.exit(1);
}
const tts = createElevenLabsTts({ apiKey, voiceId: process.env.ELEVENLABS_VOICE_ID?.trim(), modelId: 'eleven_multilingual_v2' });
const pack: Record<string, string> = {};
const lines = recordableLines();
let i = 0;
for (const { persona, text } of lines) {
  const audio = await tts.synthesize(forSpeech(text), persona);
  pack[packKey(persona, text)] = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`;
  process.stdout.write(`\r${++i}/${lines.length}`);
}
mkdirSync('voice-pack', { recursive: true });
writeFileSync('voice-pack/pack.json', JSON.stringify({ voiceId: tts.voiceId, clips: pack }));
console.log(`\nvoice-pack/pack.json — ${Object.keys(pack).length} clips, voice ${tts.voiceId}`);
