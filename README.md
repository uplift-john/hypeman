# Hypeman

**A personal hype man for your screen.** Share a window, tab or screen. Every few minutes Hypeman notices what you're actually working on and says one short, specific, encouraging thing about it — like a friend glancing over your shoulder, not a motivational poster.

> “Q3 Forecast is coming together. That Total column is going to save someone a headache in the next review.”

- At most **2 comments in any rolling 10 minutes**, at least 90 s apart, at random times.
- Silent when your screen is idle, when you pause or snooze, during quiet hours — and on anything private.
- Three personas: **Hype Man** (high energy), **Coach** (calm), **Bestie** (playful).
- Toast + optional spoken voice + a system notification when the tab is in the background.

## 60-second setup

Requires Node 20.12+ and a desktop Chromium, Firefox or Safari.

```bash
git clone <this repo> hypeman && cd hypeman
npm install
npm run dev          # opens http://localhost:5173
```

That's it — with no API key Hypeman runs in **mock mode** (see below). For real, screen-aware comments:

```bash
cp .env.example .env
# put your key in .env:  ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Press **Start session**, pick what to share, keep working. Press **Hype me now** if you can't wait.

## Mock mode vs. real mode

| | Mock mode (no key) | Real mode (`ANTHROPIC_API_KEY` set) |
|---|---|---|
| What generates the line | 65 canned templates in `shared/mockLines.ts` | Claude (`claude-sonnet-5-5`) via the Messages API with vision |
| What it "sees" | The shared window/tab **title** when the browser exposes one (e.g. “Q3 Forecast – Google Sheets”); otherwise a labelled *sample context* | One downscaled screenshot (≤1024 px JPEG) taken at the moment of commenting |
| Pixels sent anywhere? | **Never** — no frame leaves the browser | One frame per comment attempt, to your local server, then to Anthropic |
| Sensitive screens | Silent (title-based guard) | Silent (title guard + model instruction + output filter) |
| Badge | “Mock mode” in the header | none |

Both modes share the exact same rate limiter, scheduler, idle detection, de-duplication and UI.

## Hypeman's voice (ElevenLabs)

Hypeman talks out loud — voice is on by default, with a mute button in the session header.

- **With `ELEVENLABS_API_KEY` in `.env`**, the local server voices every line through ElevenLabs (key stays server-side; `/api/tts`). Default voice: **Liam** (young, energetic American guy) with low stability / high style for hype delivery. Want more gym bro? `npm run pick-voice` searches the Voice Library for young male "gym bro"/"hype" voices with preview links; add one and set `ELEVENLABS_VOICE_ID`.
- **Hosted page:** it can't call ElevenLabs at runtime, so `npm run voice-pack` pre-records every reaction into `voice-pack/pack.json`, and `npm run build:hosted` bakes the clips in. Claude then picks the best-fitting recorded reaction, so the hosted page always speaks in the real voice.
- **Without a key**, the browser's built-in voice is used (a male English voice where available).

## Privacy guarantees

- **You choose what it sees.** Only the window/tab/screen you pick in the browser's own dialog. A red **Live / Sharing screen** badge shows whenever capture is on; Stop ends it instantly, and ending the share from the browser ends the session.
- **Nothing is stored.** Screenshots are never written to disk, logged, cached or kept in memory between comments. Idle detection uses a tiny 160×90 greyscale thumbnail that never leaves the browser. `localStorage` holds only your settings, your 👍/👎 history (the lines Hypeman said) and the times of the last few comments (so a reload can't reset the rate limit).
- **Frames only when commenting.** The browser samples a thumbnail every ~20 s for idle detection; a real frame is captured and sent only at the moment Hypeman is about to speak (real mode only).
- **Private stays private.** Banking, payments, password managers, sign-in pages, health portals, private messengers and similar titles are silenced *before* any frame is sent; the model is instructed to stay silent on sensitive content; and every generated line is filtered for amounts, account/card numbers, emails, phone numbers and health terms.
- **Your key stays on your machine.** The API key lives only in the local Node server, which binds to `127.0.0.1`, accepts requests only from the app's own origin, requires JSON, limits body size and caps request volume.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server (127.0.0.1:8787) + Vite (localhost:5173) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Vitest unit tests (rate limiter properties, engine, generators, server…) |
| `npm run test:e2e` | Playwright end-to-end tests with a fake screen share (needs Chromium: `npx playwright install chromium`) |
| `npm run screenshots` | Every screen × light/dark × 1280/360 → `review/latest/` (`HYPEMAN_SHOTS_DIR` to change) |
| `npm run copy-sample` | Prints 30 mock comments across fake screens, incl. blank and sensitive ones |
| `npx tsx scripts/cadence.ts` | Measures the average gap between comments for each frequency preset |

## How it's built

```
src/        React UI · SessionEngine (state machine) · screen capture · voice/notifications
shared/     pure logic: rateLimiter · scheduler · dedupe · sensitive · postFilter · personas · mock lines
server/     Hono API: /api/health, /api/hype → mock or real generator
tests/      unit (Vitest + fast-check) · e2e (Playwright + fake getDisplayMedia)
```

See `PLAN.md` for the architecture and data flow, `DECISIONS.md` for every judgement call, `PROGRESS.md` for the build log and review verdicts.

## Known limitations

- **Real mode was not exercised against the live API in this build environment** (no key available). The request shape, parsing, refusal/timeout handling and post-filters are tested against a stubbed SDK client; copy quality in real mode is untested end-to-end.
- **Window titles are a snapshot.** Browsers expose the shared surface's label once, at share time (and not at all for whole-screen shares), so the title-based sensitivity guard and mock context don't follow you if you switch tabs inside a shared screen. Real mode still looks at actual pixels; the model is the main guard there.
- **Idle detection is heuristic.** A ticking clock or animated content can count as "active"; very small edits on a huge screen might not.
- **Background tabs:** browsers throttle timers in hidden tabs, so a comment may arrive up to ~1 minute later than scheduled. Notifications need permission and may be suppressed by OS focus modes.
- **Voices** depend on what your OS/browser provides; some browsers only load voices after first use.
- Single user, single machine by design — no accounts, no sync.

## Next steps (highest leverage)

1. **Live real-mode evaluation:** run the copy sampler against the real API on a fixture set of screenshots (incl. sensitive ones), score specificity/tone/silence, and tune the prompt with that eval.
2. **Better context without more capture:** use per-tab titles via a tiny browser extension (or Capture Handle) so the sensitivity guard and context follow the user across tabs.
3. **Learn from 👍/👎:** feed recent reactions (lines only) back into the prompt as style preferences, so the hype man adapts to what lands for each person.
