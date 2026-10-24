# Hypeman — Voice & Listening Goal Loop

Run this from the repo root with Claude Code in a local terminal (not a cloud sandbox): you need the machine's audio, network access to api.elevenlabs.io and api.anthropic.com, and `.env` containing `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` (the key needs Text to Speech, Speech to Text and Voices permissions). Install `ffmpeg` first (`brew install ffmpeg`).

```
claude "$(cat prompts/voice-and-listening-loop.md)"
```

---

You are the lead engineer on **Hypeman** (this repo: read `README.md`, `PLAN.md`, `DECISIONS.md`, `PROGRESS.md` first). Hypeman is a hype man: in **Listen** mode he hears the conversation in the room and chimes in at good moments with short, natural-sounding reactions like "Yesssir!", "That's hilarious!", "You're spot on." The owner has tested the deployed app and reports two blocking problems:

1. **Audio quality has hit a wall.** Generated TTS (ElevenLabs, browser speech) sounds robotic: no natural pauses or intonation.
2. **Listen mode never responds.** With the mic on and people talking, he says nothing.

Your job: fix both, prove it with independent reviewers, and only then hand it back. **Do not ask the owner anything until the Definition of Done is met**, except the one checkpoint in Phase 2 (clip recording). Decide, log the decision with a one-line reason in `DECISIONS.md`, keep moving. Track iterations in `PROGRESS.md`.

## Phase 0 — Diagnose before changing anything

Write `review/voice-loop/diagnosis.md` answering, **with evidence** (logs, recordings, test output — not opinions):

**Listening bug — prove or rule out each hypothesis:**
- H1: Claude is over-instructed to stay silent. `server/prompt.ts` (`LISTEN_RULES`: "Most of the time stay silent") may make the model decline nearly every moment. Measure: send 20 realistic transcript moments (funny, wins, agreement, neutral, sensitive) through the real `/api/hype` and record speak/silent per moment.
- H2: Recognition dies after the greeting. `src/listen/listener.ts` aborts recognition while Hypeman speaks (`setSpeaking`) and restarts 600 ms later; in real Chrome this can throw (`InvalidStateError`) or never restart. Instrument `onstart/onend/onerror/onresult` with timestamps and run a real session in Google Chrome (not Chromium) with your microphone.
- H3: Moments never fire. `src/listen/transcript.ts` `takeMoment` needs a final result, empty interim text, ≥ 6 new words, and 1.3 s of quiet. Log every `onresult` and `takeMoment` decision for a real 2-minute conversation.
- H4: Gates block it. `engine.moment()` returns early on the limiter, the 30 s floor, snooze, quiet hours, or `thinking`. Log each early return with its reason.
- H5: The Web Speech API is the wrong foundation: it needs Google's servers, can't be fed test audio, varies by browser, and stops on silence. Evaluate replacing it with **ElevenLabs Speech to Text** (Scribe; realtime/streaming if available on this account) driven by `getUserMedia` audio with `echoCancellation: true`. Note the privacy change (audio would leave the browser) and update copy if you switch.

**Audio:** play the current output for 10 lines through TTS (current model `eleven_multilingual_v2`) and measure it (see the Audio reviewer's metrics below), so later iterations have a baseline.

## Phase 1 — Fix listening (make it testable first)

1. Add a **test harness** that runs the real listening pipeline against **audio files**, not a mic: `tests/audio/conversations/*.wav`. Create at least 12 recordings of 30–90 s conversations (generate them with ElevenLabs TTS using two or more different voices taking turns, with natural pauses). Include: a joke and laughter, someone sharing good news, a strong opinion others agree with, a neutral logistics chat, a sensitive topic (illness or a breakup), and an argument. Each file gets a sidecar `.json` with expected behaviour: which moments should get a reaction, which kind (funny / win / agree), and where he must stay silent.
2. Fix the root causes Phase 0 proved. If you switch to server-side STT, keep the transcript text-only beyond STT, never store audio or transcripts, and keep the echo guard: he must never react to his own voice. Test by playing his clips into the pipeline.
3. Retune the listen prompt so that on the fixture set he reacts to **≥ 80 % of the moments marked "should react"**, to **0 %** of the sensitive or argument moments, and to **≤ 20 %** of neutral pauses. Keep the rate limits (4 per 10 min, ≥ 60 s apart) unless the evidence says they're the problem; if you change them, log why.
4. Latency budget: from end of speech to start of his reaction **≤ 2.5 s** median, measured.

## Phase 2 — Fix audio: recorded clip pack first, TTS second

The owner's preferred direction is a **pack of real recorded clips**. Build for that:

1. **Clip pack format:** `public/clips/<persona>/<id>.mp3` plus `public/clips/manifest.json`, with entries `{ id, persona, text, vibe: funny|win|agree|greeting|any, durationMs }`. Each clip must be loudness-normalised to −16 LUFS with silence trimmed to ≤ 80 ms at each end (use ffmpeg).
2. **Selection:** when a clip pack exists, Claude picks a clip **id** from the manifest for the moment (or stays silent) instead of writing free text. Free-text TTS stays as an optional fallback, off by default. Dedupe and the rate limits apply to clip ids. Update the hosted voice-pack path to use the same manifest.
3. **Clip script:** write `clips/SCRIPT.md` with 20–25 short lines for the default persona (Hype Man), grouped by vibe, written to be said out loud (e.g. "Yesssirrr!", "Ohhh, that's hilarious!", "You're spot on!", "Let's gooo!", "Facts!", "Okay, I see you!", "Stop, I can't!"). Add recording instructions: phone voice memo in a quiet room, 20–30 cm from the mic, 3 takes per line with real energy, one file per take named `<id>-take<N>.m4a`, dropped into `clips/raw/`.
4. **`npm run clips:import`:** converts `clips/raw/*` → normalised mp3s, auto-picks the best take per line (loudness consistency, no clipping, least background noise, cleanest STT match to the script text), and writes the manifest.
5. **Interim pack:** until the owner records, generate a stand-in pack with ElevenLabs `eleven_v3` (audio tags such as `[excited]` and `[laughs]` are allowed), making **5 takes per line** and auto-selecting the best with the metrics below. It must be clearly labelled as generated.
6. **The one checkpoint:** when the pipeline works end to end with the interim pack and all reviewers pass, stop and tell the owner exactly what to record (link `clips/SCRIPT.md`) and how to drop the files in. When the files arrive, run `clips:import`, re-run the review panel, then finish.

## Review panel (each a separate subagent, run in parallel every iteration)

Give each reviewer the artefacts and their rubric, **not your opinion**. Each returns `PASS`/`FAIL` plus a ranked issue list (blocker / major / minor) with a concrete fix. Save reports to `review/voice-loop/iteration-N/<reviewer>.md`.

| Reviewer | Fails the build if… |
|---|---|
| **Listening QA** | The fixture conversations miss the targets in Phase 1.3; any reaction lands mid-sentence (before the speaker finished); he reacts to his own voice when it's played back; recognition doesn't recover after 5 minutes of continuous use or after 60 s of silence; any error is silent (every failure must show in the "last look" line); fewer than 5 new adversarial tests per round. |
| **Audio Quality** | Any clip has clipping, more than 120 ms of leading silence, loudness outside −16 ± 1.5 LUFS, or a sample rate below 44.1 kHz; the STT transcript of a clip doesn't match its text (word error rate > 10 %); pitch variance (F0 standard deviation measured with ffmpeg/aubio/praat) is below a natural-speech threshold you set from the baseline; generated clips aren't labelled. Reviewers can't listen, so they **measure**. |
| **Vibe / Copy** | A reaction doesn't fit the moment's vibe; any reaction is sarcastic, mean, or takes sides; anything sensitive or argumentative gets a reaction; the clip script has lines that are hard to say naturally or sound corporate. |
| **Privacy** | Audio or transcripts are stored or logged; audio leaves the browser without the UI saying so; the mic stays on after Stop or Pause (verify with the browser's media indicators); keys reach the client. |
| **End-to-end** | `npm run typecheck`, `npm run lint`, `npm test` and the audio harness aren't all green on 3 consecutive runs; the Vercel build (`npm run build:vercel`) fails; Listen mode doesn't work in Google Chrome on macOS in a real session the reviewer drives with recorded audio played through the speakers into the mic. |

## Definition of Done

- [ ] `review/voice-loop/diagnosis.md` names the proven root cause(s) of the listening bug.
- [ ] The listening harness passes the Phase 1 targets on 3 consecutive runs; latency ≤ 2.5 s median.
- [ ] The clip-pack pipeline works end to end (manifest, Claude picks clip ids, playback, dedupe, limits), with the interim generated pack, and then with the owner's recorded pack after the checkpoint.
- [ ] All five reviewers return PASS with zero blockers and majors **in the same iteration** (minimum 2 rounds; hard cap 6, after which write an honest gap report).
- [ ] Everything is committed and pushed; the Vercel preview builds; `PROGRESS.md` and `DECISIONS.md` are updated honestly.
- [ ] A short owner test script, `review/voice-loop/TRY-IT.md`: 5 steps, under 2 minutes, saying what they should hear and see.

When done, print: what was broken (with evidence), what changed, the reviewer verdicts, the measured numbers (reaction hit rate, false-positive rate, latency, audio metrics), and the single thing still most likely to disappoint.
