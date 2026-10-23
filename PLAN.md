# Hypeman — Plan (Iteration 0)

## Architecture at a glance

Hypeman is a single-repo local web app: a Vite/React/TS/Tailwind frontend plus a tiny
Hono server that owns the Anthropic API key. Everything that decides *when* Hypeman
may speak lives in pure, clock-injected modules under `shared/` so it can be tested
exhaustively without a browser.

```
 ┌──────────────────────────── Browser (localhost:5173) ─────────────────────────────┐
 │                                                                                    │
 │  getDisplayMedia() ──► ScreenCapture ──(every ~20s)──► 64×36 luma thumb           │
 │        │                     │                              │                      │
 │        │ track 'ended'       │ captureFrame() ≤1024px JPEG   ▼ pixelDiff()          │
 │        ▼                     │ (ONLY when about to comment)  ActivityTracker        │
 │  SessionEngine ◄─────────────┘                               (idle ≥ 3 min)         │
 │   • Scheduler (random delay by frequency)                                          │
 │   • RateLimiter (rolling 600s ≤ 2, ≥ 90s gap)  ◄── shared/rateLimiter.ts (pure)    │
 │   • gates: paused / snoozed / idle / quiet hours / hidden-sensitive                │
 │   • memory of last 20 lines → sent to server, dedupe on return                     │
 │        │ POST /api/hype {image?, persona, recent[], hint}                          │
 │        ▼                                                                           │
 │  UI: Onboarding · Session view · Toast (aria-live) · Settings drawer               │
 │      Voice (speechSynthesis, opt-in) · Notification (when tab hidden)              │
 │      localStorage: settings + reaction history only (never frames)                 │
 └────────────────────────────────────────┬───────────────────────────────────────────┘
                                          │ Vite proxy /api → 127.0.0.1:8787
 ┌────────────────────────────── Node server (Hono) ─────────────────────────────────┐
 │  Origin + content-type guard · body-size limit · request cap (cost guard)          │
 │  hint sensitivity pre-filter (window title) → silent, frame never forwarded       │
 │  ANTHROPIC_API_KEY?  ── yes ─► RealGenerator: Messages API (vision, JSON schema)   │
 │                      └─ no ──► MockGenerator: 60+ canned lines × fake context      │
 │  post-filter: length, sensitive patterns, near-duplicate → {speak:false}           │
 │  frames live only in memory for the duration of one request; never logged/written │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

## Module boundaries

| Module | Responsibility | Pure? |
|---|---|---|
| `shared/rateLimiter.ts` | Rolling-window (2 / 600 s) + min-gap (90 s) limiter, injectable clock, clamps backwards clock jumps | ✅ |
| `shared/scheduler.ts` | Random next-attempt delay per frequency preset; idle/quiet-hours helpers | ✅ (rng injected) |
| `shared/dedupe.ts` | Normalise + token-Jaccard near-duplicate check | ✅ |
| `shared/sensitive.ts` | Keyword/pattern guard for hints (window titles) and generated lines | ✅ |
| `shared/personas.ts` | Persona definitions (tone only) | ✅ |
| `shared/mockLines.ts` / `shared/fakeContexts.ts` | 60+ canned lines by category, fake contexts | ✅ |
| `shared/fixtures.ts` | Fake screens (code, email, sheet, slides, design, blank, bank…) for tests/demo | ✅ |
| `server/generators/*` | `mock` and `real` generators behind one `Generator` interface | mock ✅ / real (SDK injected) |
| `server/prompt.ts` | System prompt + per-request user text | ✅ |
| `server/app.ts` | Hono app factory (deps injected) | — |
| `src/capture/pixelDiff.ts` | Luma thumbnail diff | ✅ |
| `src/capture/screenCapture.ts` | getDisplayMedia wrapper, sampling, frame grab | browser |
| `src/session/engine.ts` | Session state machine; owns limiter + scheduler; deps injected (clock, timers, capture, api, rng) | ✅ (with fakes) |
| `src/session/useSession.ts` | React binding | — |
| `src/components/*` | Onboarding, SessionView, Toast, SettingsDrawer, Feed, StatusPill… | — |

## File tree (target)

```
hypeman/
  PLAN.md DECISIONS.md PROGRESS.md README.md
  package.json vite.config.ts tsconfig*.json eslint.config.js playwright.config.ts
  index.html  .env.example
  shared/   rateLimiter scheduler dedupe sensitive personas mockLines fakeContexts fixtures types
  server/   index.ts app.ts prompt.ts generators/{mock,real,index}.ts
  src/      main.tsx App.tsx index.css
            capture/{screenCapture,pixelDiff}.ts
            session/{engine,useSession,clock}.ts
            lib/{storage,voice,notify,time}.ts
            components/…
  tests/unit/*.test.ts   tests/e2e/*.spec.ts  tests/e2e/fakeDisplay.ts
  review/iteration-N/  review/final/
```

## Data flow for one comment

1. Scheduler fires at a random time T (or user presses **Hype me now**).
2. Engine checks gates in order: session active → not paused → not snoozed → not quiet hours
   → not idle (manual button skips idle only) → `limiter.check(now)`.
3. If allowed, engine **reserves** a slot (`limiter.record(now)`) *before* the network call, so
   concurrent triggers cannot double-spend. On failure/silence the reservation is released.
4. Capture one fresh frame (≤1024 px JPEG, in memory) → POST `/api/hype`.
5. Server: guard → sensitivity pre-filter on hint → generator → post-filter → JSON.
6. If `speak`: toast + feed + optional voice + Notification (if hidden). Else release slot, try
   again later (randomised).

## Test plan

- **Unit (Vitest)**: rate limiter exhaustive + fast-check property over simulated 8 h sessions with
  random activity, button spam, clock jumps (fwd/back), sleep/wake; scheduler distribution
  (mean 6–9 min for Normal); dedupe; sensitive guard; mock generator (60+ lines, no dupes over a
  session, bank → silence); real generator with a stubbed SDK client (request shape, JSON parsing,
  refusal/timeout/garbage handling, post-filter); server app (origin guard, size limit, mock mode
  w/o key, error mapping); engine with fake clock (gates, idle, pause/resume spam, share revoked,
  API errors back off without spamming, reservation release).
- **E2E (Playwright, Chromium)**: fake `getDisplayMedia` via init script (canvas stream of fixture
  screens); onboarding → start → comment via fast-forwarded clock; Hype-me-now countdown at limit;
  pause/snooze/stop; permission denied; share revoked; bank fixture produces silence; settings
  persist; axe scan of every screen in light/dark; keyboard-only flow; screenshot project writes
  every screen × light/dark × 1280/360 into `review/iteration-N/`.
