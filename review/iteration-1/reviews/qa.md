# QA Review — iteration 1

VERDICT: FAIL

RUNS (baseline, before any new tests were added):
- typecheck: PASS (exit 0)
- lint: PASS (exit 0, 0 warnings)
- unit x3: 129/129 passed on each of 3 runs (5 files). Not flaky.
- e2e (`--project=e2e`, ports 5301/8901), 23 tests: 21 passed, 2 failed.
  - `app.spec.ts:153 "API errors show one calm notice, no crash, no spam"` FAILS EVERY TIME. Over 4 runs it made 9, 8, 7 and 7 /api/hype calls in 30 min, against an allowed maximum of 5. This is a real bug (see issue 2).
  - `app.spec.ts:271 "axe: no violations on every screen (dark)"` is FLAKY. Run 1 failed with ENOENT on the trace file, probably because parallel reviewers share `test-results/`. One rerun failed with "Execution context was destroyed … navigation". It passed in the other 2 reruns.

NEW TESTS (14 unit in tests/unit/adversarial-r1.test.ts, 6 e2e in tests/e2e/adversarial-r1.spec.ts):
Unit:
- FAIL: error backoff is not bypassed when the screen flips idle → active. It made 15 calls in 1 h; the limit is 5.
- FAIL: a hanging API cannot wedge the limiter or produce a burst once it recovers. Two comments were delivered 0 s apart.
- FAIL: a slow first reply plus fast later replies cannot put 2 comments within 90 s or 3 within 600 s, measured by delivery time. Two comments were delivered 57 s apart.
- FAIL: pause → resume while a request is in flight leaves a ghost slot. usedInWindow is 1 and the gap countdown shows even though nothing was said.
- FAIL: a delivery stamped in the future (wall clock corrected) still blocks after 10 real minutes.
- PASS: stale in-flight result after pause/resume plus hammering never breaks spacing.
- PASS: share revoked mid-request: no comment and no timers. A double "ended" event is harmless. After restart the limiter still remembers.
- PASS: monotonic clock frozen during sleep plus wall-clock jumps of ±3 days: still ≤2 per 600 s.
- PASS: limiter release() after a backwards clock jump frees exactly one slot.
- PASS: corrupted `hypeman.deliveries.v1` never throws and never unlocks extra comments.
- PASS: api.ts aborts a request that never answers after 35 s with a friendly ApiError.
- PASS: a non-JSON 502 HTML body becomes a clean ApiError.
- PASS: real server process started from a directory with no .env and no key boots in mock mode, and /api/hype returns a line.
- PASS: mock mode is not cost-capped (30 parallel requests all return 200).
E2E:
- FAIL: a slow model reply (34 s) cannot shrink the 90 s gap. 60 s after the first comment appeared, "Hype me now" is enabled again.
- FAIL: two tabs open at once share one limit. Tab 2 comments seconds after tab 1.
- PASS: server never answers: after 35 s the client times out, shows one notice, and frees the button and the slot.
- PASS: share revoked while a request is in flight: the late reply is dropped and nothing is stored in localStorage.
- PASS: reloading mid-request does not burn a slot, and a reload after a comment keeps the 90 s gap.
- PASS: rapid pause/resume plus hammering gives exactly one comment.

ISSUES (ranked):
1. [blocker] The rate limiter stamps a comment when the request is sent, not when the comment is shown. API latency therefore shrinks the real gaps. Request A is reserved at t=0, takes 34 s, and appears at t=34. Request B is reserved at t=90, takes 1 s, and appears at t=91, only 57 s after A. Likewise C can be reserved at 600.001 s and appear at about 601 s, which puts 3 comments inside 567 s. Real mode has 3–35 s latency (client timeout 35 s), so the non-negotiable 90 s / 2-per-600 s rule can be broken in what the user actually sees. The countdown is also wrong: it counts from the request, not from the comment.
   - Repro: unit "a slow first reply + fast later replies…"; unit "a hanging API…"; e2e "a slow model reply cannot shrink the 90 s gap".
   - Fix: add `RateLimiter.commit(token, now)` in shared/rateLimiter.ts (after `tryAcquire`, :101). It should replace the reserved stamp with `effective(now)` and re-sort. Call it in src/session/engine.ts:512, just before `this.feed = [item, …]`, with `this.deps.now()`. A reservation still blocks everything while in flight, so moving the stamp later only makes the limiter more conservative. Optionally re-check at delivery: if `now - reservedAt > 35 s`, drop the line as stale.
2. [major] An API outage causes request spam whenever the screen flips idle → active. `sample()` (src/session/engine.ts:397) reschedules an attempt 5–120 s out each time the screen comes back from idle, which overrides the exponential error backoff. The unit test shows 15 calls/h where about 5 are expected. The existing e2e test `app.spec.ts:153` fails on every run with 7–9 calls in 30 min. No comments are produced, but in real mode this burns quota and keeps re-raising the error notice.
   - Repro: unit "error backoff is not bypassed…"; `npx playwright test -g "API errors"`.
   - Fix: add `private backoffUntil = 0`. Set it in the error branch of `autoAttempt` (and after `consecutiveErrors++` at :488) to `now + errorBackoff(...)`. In `sample()` at :397, skip the "soon" reschedule when `this.consecutiveErrors > 0 && now < this.backoffUntil`, or schedule at `max(soon, backoffUntil - now)`.
3. [major] Two tabs of the app open at the same time each have their own limiter, so the user can get 2 comments seconds apart, and up to 4 per 10 min. The limiter reads `hypeman.deliveries.v1` only once, at engine construction (src/session/useSession.ts:24).
   - Repro: e2e "two tabs open at once share one limit".
   - Fix: in src/App.tsx, listen to `window.addEventListener('storage', e => e.key === 'hypeman.deliveries.v1' && engine.limiter.seed(...new ages...))`, or use a BroadcastChannel('hypeman'). Before acquiring in `generate()` (engine.ts:458), re-seed from storage, deduplicating its own stamps. Alternatively, hold a Web Locks / BroadcastChannel "leader" so only one tab may run a session.
4. [minor] Pause → resume while a request is in flight leaves a ghost reservation. The stale request keeps its slot until it returns, which can take up to 35 s. During that time the UI shows "1 / 2" and "Hypeman leaves at least 90 seconds between comments… 1:29" although nothing was said, and Hype me now is refused.
   - Repro: unit "pause → resume while a request is in flight…".
   - Fix: store `this.inflightToken` in `generate()` (engine.ts:458). Release it in `pause()` (:305) and `end()` (:279) when bumping the epoch, and make `abandon` (:468) idempotent with a released flag. Also make tokens unique, e.g. an incrementing id stored alongside the stamp, so `release` (rateLimiter.ts:110) can never remove a different comment that has the same clamped timestamp.
5. [minor] Future-dated delivery stamps lock out reloads for much longer than 10 min. Entries with `at > now` (wall clock was fast, then corrected) count as "just now" on every reload. `recordDelivery` never prunes them because `nowWall - x < withinMs` is always true for negative ages.
   - Repro: unit "a delivery stamped in the future…".
   - Fix: at src/lib/storage.ts:111 and :120, drop entries with `x - nowWall > withinMs` (more than 10 min in the future). Entries slightly in the future can still count as now.
6. [minor] Manual hammering during an outage sends one request per click; the only protection is the busy guard while a request is in flight. In real mode the server cap (12 per 10 min) bounds upstream cost, but the client never backs off manual presses.
   - Fix: in `hypeNow()` (engine.ts), when `consecutiveErrors > 0 && now < backoffUntil`, return `{kind:'error'}` without a request, or apply a short cooldown of about 15 s.
7. [minor, test infra] The axe dark-mode e2e test is flaky: once with "Execution context was destroyed", and once with an ENOENT trace error. The ENOENT happens because parallel runs share `test-results/`.
   - Fix: in playwright.config.ts set `outputDir: process.env.HYPEMAN_E2E_OUTPUT ?? 'test-results'`. In app.spec.ts:271, wait for `page.waitForLoadState()` after the reload/navigation before running AxeBuilder.

Verified OK (no issue found):
- Limiter clamps backward clock jumps. A frozen monotonic clock during sleep and wall-clock jumps cannot open extra slots.
- Concurrent Hype me now presses: exactly one request.
- Share revoked, including during an in-flight request: clean end, late result dropped, nothing persisted.
- Reload keeps both the 2-per-10 limit and the 90 s gap. A reload mid-request does not burn a slot.
- A hanging server is aborted at 35 s with one calm notice and no crash.
- Non-JSON error bodies are handled.
- Mock mode boots from a directory with no .env and no key, and serves lines.
