# Progress

## Iteration 0 — Plan
- Wrote `PLAN.md` (architecture, module boundaries, data flow, test plan).
- Confirmed the current Sonnet model ID (`claude-sonnet-5-5`) from the bundled Claude API reference.
- Environment: no `ANTHROPIC_API_KEY` available here, so real mode is verified with a stubbed SDK client only (see Open issues).

## Iteration 1 — First full slice
**Built**
- Pure modules: rate limiter (rolling 2/600 s closed window, 90 s gap, atomic acquire/release, clock-jump clamping, reload seeding), scheduler (presets, quiet hours, backoff), dedupe, sensitivity guards, post-filter, personas, 65 mock templates, screen fixtures.
- Server (Hono): `/api/health`, `/api/hype`; origin allow-list, JSON-only, body limit, cost guard (real mode), sensitive-title pre-filter, mock + real generators (Messages API, vision, JSON schema output).
- Client: `SessionEngine` state machine (deps injected), screen capture (getDisplayMedia → off-DOM video → thumbnails / single JPEG), React UI: start screen, session view, toast, settings drawer; light/dark tokens.
- Tests: 129 unit tests (incl. fast-check properties over random 8 h sessions for limiter and engine), 23 e2e tests (flows, edge cases, axe light+dark, keyboard, reduced motion, 360 px), screenshot project (13 screens × 2 themes × 2 widths).

**Bugs found while verifying**
- Idle detection was blind to typing: 64×36 thumbnails averaged a typed word away. Now 160×90 with Δ>8 on ≥0.05 % of pixels (unit-tested: caret blink ignored, one typed word detected).
- 360 px header overflowed by 41 px ("Sharing screen" badge). Badge now reads "Live" under 420 px.
- Server cost guard (12 req/10 min) also throttled mock mode; it's now real-mode only.

**Verification**: typecheck ✅ lint ✅ unit 129/129 ✅ e2e 23/23 ✅ screenshots → `review/iteration-1/`.

**Reviewer verdicts**: pending (panel convened next).
