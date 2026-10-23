# Decisions

Each entry: the call, and a one-line reason.

## Platform & stack

- **Model: `claude-sonnet-5-5`** (current Claude Sonnet per Anthropic's model table). — The brief asks for "the current Claude Sonnet model"; confirmed against the bundled Claude API reference rather than guessed.
- **Structured output via `output_config.format` (JSON schema) instead of "please return JSON" prompting.** — Guarantees parseable `{speak, line, reason}`; a lenient parser is kept as a fallback anyway.
- **`effort: "low"`, `max_tokens: 2000`, thinking left at the model default.** — One short line from one image; latency matters more than depth. Sonnet 5.5 rejects disabled thinking, so we don't send it.
- **Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is enabled.** — Recommended default for Sonnet 5.5 on the Claude API; a refusal still maps to silence.
- **Hono + @hono/node-server** for the backend. — Tiny, typed, and `app.request()` makes the API unit-testable without a socket.
- **API server binds to `127.0.0.1` only; Vite proxies `/api`.** — The key-holding proxy must never be reachable from the network.
- **Single `package.json`, single `tsconfig.json`.** — "Prefer deleting complexity": one install, one typecheck covers browser, server and tests.
- **TypeScript 5.9, ESLint 9.** — TS 7 / ESLint 10 were too new for typescript-eslint at build time.
- **`.npmrc` sets `legacy-peer-deps=true`.** — npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) resolving Vitest's optional peer deps; this keeps `npm install` working from a clean clone.
- **Playwright pinned to 1.63.0.** — Matches the preinstalled Chromium build (1243) in this environment; elsewhere `npx playwright install chromium` fetches it.
- **No jsdom / React Testing Library.** — UI is covered end-to-end in a real browser; logic lives in pure modules tested with Vitest. (jsdom also tripped the same npm bug.)

## Rate limiting & timing

- **Closed 600 s window:** a comment exactly 600 s old still counts, so any three comments span *strictly more* than 600 s. — Removes any boundary ambiguity in "never more than 2 in any 600 s window".
- **Limiter is atomic and reserves the slot before the network call; slots are released if nothing is spoken.** — Concurrent triggers (button spam + timer) can't double-spend, and silence/errors don't burn the user's quota.
- **The engine's clock is `performance.now()` (monotonic).** — Wall-clock jumps can't open slots early; during sleep a monotonic clock can only lag reality, which makes the limiter more conservative, never less.
- **The limiter also clamps backwards time to a high-water mark.** — Defence in depth if an injected clock ever goes backwards.
- **Recent delivery times are persisted (`hypeman.deliveries.v1`, last 10 min only) and seed the limiter on load.** — A page reload must not reset the 2-per-10 rule. Kept separate from reaction history so "Clear history" can't reset it either.
- **Frequency presets draw uniformly: Chill 8–18 min, Normal 4–11 min, Max 2.5–6.5 min.** — Measured with `scripts/cadence.ts`: Normal averages ≈7.4 min between comments while active (target 6–9); Max averages ≈5.4 min and is capped by the limiter.
- **Model silence → retry in 2–4 min; API errors → exponential backoff 2→30 min.** — Never spam a failing API; never leave the user without comments for long when it's just a quiet screen.
- **Coming back from idle waits a random 5–120 s before commenting.** — Feels natural; avoids "pouncing" the instant you touch the keyboard.
- **"Hype me now" bypasses random timing, idle, snooze and quiet hours, but not Pause and never the limiter.** — It's an explicit request; Pause means "not watching", so it's disabled there with an explanation.
- **Frequency change re-draws the next delay; never fires early.**

## Capture & privacy

- **Idle detection uses a 64×36 greyscale thumbnail diff that never leaves the browser.** — Cheap, private, robust to compression noise (pixel Δ>10 on ≥0.4% of pixels).
- **A full frame (≤1024 px wide JPEG, q=0.72) is grabbed only at the moment of commenting, in real mode only.** — In mock mode the server doesn't need pixels, so the engine sends none at all.
- **Frames are never written anywhere:** canvases are zeroed after encoding, the server never logs bodies, and responses are `Cache-Control: no-store`.
- **Sensitive-title pre-filter on the server** (window/tab title from the track label) returns silence *before* the generator runs, so the frame is never forwarded. A post-filter on generated lines blocks money amounts, account/card numbers, emails, phone numbers, health words. — Belt and braces around the model's own instruction to stay silent.
- **Origin allow-list + `application/json` requirement + body size limit + request cap (12 / 10 min) on `/api/hype`.** — A random website must not be able to drive the user's API key through `localhost`.
- **Notifications fire only when the tab is hidden; permission is requested on the Start click.** — Avoids double alerts and permission prompts on page load.

## Voice & content

- **Persona affects tone only; the rules block in the system prompt is byte-identical for all personas** (tested).
- **Mock lines are templates that always reference `{subject}`/`{detail}`.** — Mock output must never be generic either. Context comes from the window title when the browser exposes one; otherwise a labelled "sample context".
- **Post-filter normalises rather than drops when it can** (strip emojis/quotes, collapse "!!!", de-shout ALL CAPS) and drops when it must (too long, generic, sensitive, duplicate).
- **Near-duplicate = token-set Jaccard ≥ 0.6 or same normalised text**, checked on the server (against the client-sent memory) and again in the client.

## UX

- **One start screen** doubles as onboarding: headline, one-paragraph explainer, 3 privacy bullets, persona picker, one Start button.
- **Status priority:** Taking a look › Paused › Snoozed › Quiet hours › Idle › Listening. — Exactly one state is ever shown.
- **Countdown only when limited** (and labelled differently for the 90 s breather vs. the 2-per-10 cap); otherwise "Anytime in the next few minutes".
- **"Hype me now" uses `aria-disabled` (still focusable) with an explanation**, rather than `disabled`. — Keyboard and screen-reader users can discover *why* it's unavailable.
- **Toast: bottom-right, 8 s with progress bar, hover/focus holds, Esc dismisses, reactions inline.** The live region is always mounted so announcements are reliable.
- **Accent:** hype orange `#D23C08` (light; white text 4.78:1) / `#FF6A2B` (dark; near-black text 6.7:1). Warm neutrals. Display font Bricolage Grotesque, body Inter (both bundled via @fontsource — works offline).
