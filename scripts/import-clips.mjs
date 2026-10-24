/**
 * Turns raw voice recordings into Hypeman's clip pack.
 *   clips/raw/<id>.(m4a|wav|mp3)   your recordings, one line per file
 *   clips/clips.json               what each clip says: [{ "id": "clip01", "text": "Yesssir!", "vibe": "win" }]
 * → public/clips/<id>.mp3 (mono 44.1 kHz, silence trimmed, loudness-normalised to −16 LUFS)
 * → public/clips/manifest.json
 *   npm run clips:import
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const RAW = 'clips/raw';
const OUT = 'public/clips';
const META = 'clips/clips.json';
mkdirSync(OUT, { recursive: true });

const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : [];
const byId = new Map(meta.map((m) => [m.id, m]));
/** ffmpeg prints filter reports on stderr. */
const stderrOf = (args) => {
  const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats ${args} -f null - 2>&1 || true`], { encoding: 'utf8' });
  return r;
};

const TRIM =
  // trim leading silence, reverse, trim (former trailing) silence, reverse back; keep ~60 ms of air
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';

const manifest = [];
for (const f of readdirSync(RAW).filter((x) => /\.(m4a|wav|mp3|aac|caf)$/i.test(x)).sort()) {
  const id = basename(f, extname(f));
  const src = join(RAW, f);
  const tmp = join(OUT, `${id}.tmp.wav`);
  const dst = join(OUT, `${id}.mp3`);
  // 1) mono, 44.1 kHz, trimmed
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-af', TRIM, tmp]);
  // 2) two-pass loudness normalisation to −16 LUFS, true peak ≤ −1.5 dBTP
  const pass1 = stderrOf(`-i ${tmp} -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`);
  const j = JSON.parse(pass1.slice(pass1.lastIndexOf('{'), pass1.lastIndexOf('}') + 1));
  const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', ln, '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', dst]);
  execFileSync('rm', ['-f', tmp]);
  // 3) measure the result
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], { encoding: 'utf8' }).trim());
  const rep = stderrOf(`-i ${dst} -af ebur128=peak=true`);
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(rep.slice(rep.lastIndexOf('Summary')))?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(rep.slice(rep.lastIndexOf('Summary')))?.[1]);
  const m = byId.get(id) ?? {};
  manifest.push({ id, src: `/clips/${id}.mp3`, text: m.text ?? '', vibe: m.vibe ?? 'any', durationMs: Math.round(dur * 1000) });
  console.log(`${id}\t${dur.toFixed(2)}s\t${I.toFixed(1)} LUFS\tpeak ${peak.toFixed(1)} dBFS\t${m.text ? `"${m.text}" (${m.vibe ?? 'any'})` : '(no text yet)'}`);
}
const json = JSON.stringify({ clips: manifest }, null, 2) + '\n';
writeFileSync(join(OUT, 'manifest.json'), json);
// The server reads the same list (bundled into the API), so it can pick a clip for the moment.
writeFileSync('shared/clipManifest.json', json);
console.log(`\n${manifest.length} clips → ${OUT}/ and shared/clipManifest.json`);
