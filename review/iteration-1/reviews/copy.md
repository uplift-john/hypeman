# Hype Copy Review: iteration 1

```
VERDICT: FAIL
SAMPLE STATS: 90 generated (seeds 1-3 × 30): 60 spoken + 30 silent
  generic: 9/60 (15%) | cringe/broken: 10/60 (17%) | sensitive leaks: 0 | bank → silent? YES (6/6 with title)
  Repetition stress (one screen, 14 glances, one persona): 3 near-duplicates got past dedupe
  Real mode (I wrote the lines as the model): 7/7 work screens on-voice and specific, 5/5 blank and sensitive screens silent
```

The safety plumbing is solid: the server's title gate, the post-filter and real-mode rule 5 together give silence on every sensitive fixture. The real-mode prompt is good. The FAIL comes from **mock-mode copy**. Email lines are generic. Placeholders collide and produce broken sentences ("The triage pace is…" right after "Inbox-clearing pace…"). Dedupe also lets the same joke repeat with only the placeholder swapped.

## How I tested
- I ran `npx tsx scripts/copy-sample.ts 30 {1,2,3,4}` (all 4 seeds were read; stats use seeds 1-3).
- Stress test (scratch script, not committed): 14 glances in a row on the same fixture for one persona, for email/code × hype/bestie. I also ran 4 glances with `hint: undefined`, which is the entire-screen share where the label is `screen:0:0`.
- Real mode: I read `server/prompt.ts`, `server/generators/real.ts`, `shared/postFilter.ts`, `shared/sensitive.ts` and `server/app.ts`, then answered as the model for every fixture.

## Issues (ranked)

### 1. [blocker] Email mock lines are generic, so the 10% generic ceiling is exceeded
Evidence: for email, `subject` is always `"your inbox"` and `detail` is one of `the triage pace / that run of replies / the inbox count dropping` (context.ts L33). The `(9)` in `Inbox (9) - Gmail` is thrown away. Each line could be said about any inbox:
- s1#2 "Love the triage pace. You're clearing your inbox like it owes you money."
- s2#26 "That run of replies? Who are you, the inbox whisperer?"
- s3#14 "Calm, methodical triage. The triage pace is real progress, even if it doesn't feel dramatic."

That is 3 per seed, 9/60 = 15% generic.

Fix: take the count from the title, and go silent when there is none. That matches real-mode rule 2, "If you cannot name something concrete… stay silent".
- `shared/context.ts` L33 → `  email: ['the unread count'],` (fallback only; see below)
- `shared/context.ts` L80 (`const subject = …`), insert before it:
```ts
  if (category === 'email') {
    const m = /\((\d+)\)|(\d+)\s+unread/i.exec(title);
    if (!m) return { category: 'blank', subject: '', detail: '', source: 'title' }; // nothing concrete → silent
    return { category, subject: 'your inbox', detail: `${m[1] ?? m[2]} unread`, source: 'title' };
  }
```
- `shared/context.ts` L46-47 (FAKE_CONTEXTS email): details `'9 unread'` and `'4 unread'`.
- `shared/mockLines.ts` L30-39: replace the email block. `{detail}` is now e.g. "9 unread":
```ts
  L('email', 'hype', "Only {detail} left in {subject}. You're clearing it like it owes you money."),
  L('email', 'hype', "{Detail} and counting down. You're running {subject} instead of it running you."),
  L('email', 'hype', "Inbox at {detail} and you're still swinging. That is elite triage."),
  L('email', 'hype', "{Detail} in {subject} and the whole list looks under control. Big inbox-boss energy."),
  L('email', 'coach', 'Good rhythm. {Detail} means fewer loose ends waiting for you tomorrow.'),
  L('email', 'coach', "One reply at a time, and {subject} is at {detail}. That's how a clear head gets built."),
  L('email', 'coach', 'Calm, methodical triage. Getting {subject} to {detail} is real progress.'),
  L('email', 'bestie', '{Detail}? Who are you, the inbox whisperer?'),
  L('email', 'bestie', 'Watching {subject} sit at {detail} is weirdly soothing. Very cool of you.'),
  L('email', 'bestie', 'If {subject} could talk, it would thank you. {Detail} looks very tidy.'),
```
This removes "champion" (L33, cringe), the fragment template (L38) and "even if it doesn't feel dramatic" (L36, faintly backhanded).

### 2. [blocker] Placeholder collisions produce broken or clunky lines (10/60)
Evidence (seed#line):
- s2#2, s3#2 "Inbox-clearing pace is elite right now. **The triage pace** is a genuinely satisfying thing to watch." (pace/pace)
- s1#14, s3#14 "Calm, methodical **triage. The triage** pace is real progress…"
- s2#14 "One reply at a time and look: the triage pace. That's how a clear head gets built." (nonsense)
- s1#26 "Watching your inbox shrink is weirdly soothing. The inbox count dropping, very cool of you." (fragment)
- s2#7 "Deep in useEffect and actually absorbing it. **That focus on that section** pays off."
- s1#4 "…a **deck** people remember. The **deck** flow lands…"; s1#28 "Your **deck** has taste. The **deck** flow…"
- s4#25 "**That tidy** refactor in checkout.tsx is so **tidy** I want to frame it."
- s4#30 "The **work** on that component **work** is stunning."
- stress: "Sharp move in checkout.tsx. The test you **just** added **just** got simpler and stronger…" (and a test "getting simpler" is odd)

Fix (the email lines are covered by issue 1):
- `shared/context.ts` L32 → `  code: ['that last function', 'the test you just added', 'the cleanup in this file', 'that refactor'],`
- `shared/context.ts` L35 → `  slides: ['this slide', 'the story flow', 'that layout'],`
- `shared/context.ts` L37 → `  design: ['that layout', 'the spacing', 'the component states'],`
- `shared/mockLines.ts` L21 → `  L('code', 'hype', 'Sharp move in {subject}. {Detail} makes the whole file feel simpler and stronger.'),`
- `shared/mockLines.ts` L27 → `  L('code', 'bestie', "Peeked at {subject} and wow. {Detail} is so well done I'm taking notes."),`
- `shared/mockLines.ts` L28 → `  L('code', 'bestie', '{Detail} in {subject} is so neat I want to frame it. Fridge-worthy code.'),`
- `shared/mockLines.ts` L52 → `  L('slides', 'hype', '{Subject} is shaping up to be one people remember. {Detail} lands with real punch.'),`
- `shared/mockLines.ts` L60 → `  L('slides', 'bestie', 'Your slides have taste. {Detail} is clean, clear and a little bit fancy.'),`
- `shared/mockLines.ts` L82 → `  L('research', 'hype', 'Deep in {subject} and actually absorbing it. Your focus on {detail} pays off.'),`
- `shared/mockLines.ts` L86 → `  L('research', 'coach', 'Steady, curious reading. Slowing down on {detail} in {subject} is exactly right.'),`

Optional: add a unit test that renders every template × every DEFAULT_DETAILS/FAKE_CONTEXTS entry and fails when a content word longer than 3 letters appears twice.

### 3. [major] Near-duplicate lines get past dedupe in a single session
Evidence (email/hype, 14 glances): glances 0, 5 and 6 all end "**You're running your inbox instead of it running you.**", and 11 and 12 both end "**Who are you, the inbox whisperer?**". Jaccard similarity was 0.38-0.50, below `NEAR_DUPLICATE_THRESHOLD = 0.6`. The punchline is the memorable part, so the user hears the same joke three times. Swapping the placeholder only changes 2-3 tokens.

Fix: in `server/generators/mock.ts` L43, inside the loop, skip any template whose fixed text already appears in a recent line:
```ts
      for (const tpl of ordered) {
        const frame = tpl.text.split(/\{\w+\}/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
        if (frame.some((chunk) => req.recent.some((r) => r.toLowerCase().includes(chunk.toLowerCase())))) continue;
```
With this, each template is used once per session, and that also covers persona fallthrough. After 10 lines on one screen the result is silence ("exhausted"), which is correct behaviour.

### 4. [major] Mock mode comments when the title is unknown, including on a bank screen
Evidence: when `hint` is undefined (entire-screen share, so `usefulHint('screen:0:0')` returns undefined), mock uses `fakeContext` and talks confidently about files that may not be on screen: "auth-service.ts is getting seriously clean…", "Love the unread count dropping to 9…". If the bank statement is what's actually showing, Hypeman speaks instead of staying silent. Nothing sensitive leaks, and the UI tags these as "sample context" (SessionView.tsx L349), but to the user it looks like a comment on their bank screen. The fixture-based check passes (bank → silent 6/6) only because the fixture has a title.

Fix: in `server/generators/mock.ts` L35, use only the title-derived context outside an explicit demo:
```ts
      const ctx = contextFromTitle(req.hint, rng) ?? (req.hint === undefined && process.env.HYPEMAN_MOCK_DEMO === '1' ? fakeContext(rng) : undefined);
      if (!ctx) return silent('no-context');
```
Alternatively, keep the fake context and make the toast prefix "Sample:" so it can't be read as a comment on the real screen.

### 5. [major] Real prompt: the money rule conflicts with the business-spreadsheet example, and trend language invites made-up claims
Evidence:
- Rule 5 says stay silent if "anything visible involves money… amounts on invoices". The good example in the same prompt praises Q3 Forecast's Total column, and the email fixture shows "Invoice approved". A cautious model will go silent on revenue sheets, pricing pages, budgets in docs and some inboxes. That is over-silence on 2 of 7 work fixtures.
- Rule 2 asks the model to name "the inbox count going down". The model sees one frame and cannot see a trend, so it will claim changes it never saw ("down from 20", "clearer than ten minutes ago").
- There is no ban on stock hype phrases. Sonnet-class models drift toward "crushing it", "on fire" and "future you will thank you".
- There is no rule against surveillance phrasing ("I see you…", "caught you…").

Fix: replace rules 2, 5 and 7 in `server/prompt.ts` (L11, L14, L16) and add rule 10 after L18:
```
2. Be specific. Name something concrete that is visible in THIS screenshot: the document, file, deck or sheet title; the function, test or formula; the slide heading; the column; the unread count; the frame or component. Describe only what this single frame shows; never claim a change over time you cannot see ("dropping", "since earlier", "you just"). If you cannot name something concrete you can actually see, stay silent.
5. Stay silent on sensitive screens. Personal or account-level data is sensitive: bank, card, brokerage, payroll or tax screens and balances or transactions; passwords, keys, 2FA codes and login forms; health or medical information; government IDs; an opened private message or chat (any app, including an opened personal email); dating apps; other people's personal details (contact info, addresses, phone numbers). If any of this is visible anywhere, even in a corner or a notification, set speak to false and do not describe it. Work artefacts that happen to contain numbers (a forecast, budget, pricing page or pitch metric) are fine to praise, but never quote the amounts. An inbox list is fine: talk about the unread count or progress, never the senders or subject lines. When in doubt, stay silent.
7. Never quote personal data, even on an otherwise fine screen: no email addresses, phone numbers, account numbers, sums of money, sender names, email subject lines or other people's full names. Refer to things by their role ("the vendor thread", "the revenue column").
10. Sound like a friend, not a poster: avoid stock hype ("crushing it", "killing it", "on fire", "rockstar", "ninja", "champion", "superpower", "you've got this", "future you will thank you"), and never mention watching, peeking, screenshots or yourself.
```

### 6. [minor] Gaps in the title gate (server pre-check and mock mode)
`SENSITIVE_HINT_PATTERNS` (sensitive.ts) has no entries for Slack/Discord/Teams DMs, Google Messages, LinkedIn messaging, budgeting apps (Mint, Monarch, YNAB, Copilot Money), Gusto/ADP/Expensify, or Zocdoc/patient portals. Real mode still has the model as a backstop, but mock mode would comment on them. Suggested addition at sensitive.ts L29 (private messages):
```ts
  /\bslack\b.*\b(dm|direct message)\b|\bdiscord\b|\bmicrosoft teams\b.*\bchat\b|\bgoogle messages\b|\blinkedin\b.*\bmessag/i,
  /\bmint\b|\bmonarch\b|\bynab\b|\bcopilot money\b|\bgusto\b|\badp\b|\bexpensify\b|\bzocdoc\b|\bpatient portal\b/i,
```
(Check `\bmint\b` against false positives, e.g. "Linux Mint". Over-silence is the safe failure.)

### 7. [minor] Lowercase sentence starts on filenames
"checkout.tsx is getting seriously clean." and "auth-service.ts is getting…" read fine because filenames are lowercase. Leave them. If it bothers anyone, reorder L19 to `'Seriously clean work in {subject}. {Detail} reads like you knew exactly where you were going.'`

## What is working (keep)
- Every bank, password, WhatsApp and MyChart fixture was silent through two layers: the `app.ts` L91 title gate before the frame is forwarded, and the mock gate. Blank → silent.
- Persona tone separation is clear. Coach lines are calm with no exclamation marks, Bestie lines are playful and never cutting, and Hype lines are punchy.
- Best lines (keep these): "You're clearing your inbox like it owes you money." / "Whoever did the spacing has excellent taste. Oh wait, it's you." / "That last function in checkout.tsx? Crisp. You're writing code people will actually enjoy reviewing." / "Spreadsheets this clean win meetings."
- `postFilter` correctly strips emoji, collapses extra exclamation marks, lowercases shouty words, and blocks currency and email addresses as a last line of defence.

## Real mode: lines written as a model following the current prompt (Hype Man)
| Fixture | Expected output | Verdict |
|---|---|---|
| code | "cartTotal in checkout.tsx is one clean reduce, and it already has an 'applies discount' test. That's checkout code people trust." | specific, on-voice |
| email | "Inbox at 9 unread and the launch timeline thread is right there in reach. Tidy command centre." (risk: quotes a subject line; some chance of silence over "Invoice approved") | OK, but issue 5 |
| sheet | "Q3 Forecast with a SUM total for every region? That Total column is going to make the review painless." (some chance of over-silence from the money rule) | OK, but issue 5 |
| slides | "Slide 7's 'Why now' is doing real work. Nine hours to nine minutes is the line investors repeat." | specific, on-voice |
| doc | "Launch Plan opens with a goal you can measure: 200 design partners by November. That's a plan with a spine." | specific, on-voice |
| design | "A proper hover state for the primary button in Onboarding v2? That's the detail that makes the whole flow feel solid." | specific, on-voice |
| research | "Straight to the source on useEffect. Getting the 'external system' idea now saves a dozen confusing bugs later." | specific, on-voice |
| blank | silent ("nothing visible") | correct |
| bank | silent: blocked by the server title gate before the model is called; rule 5 is the backstop | correct |
| passwords | silent (title gate + rule 5) | correct |
| messages | silent (title gate + rule 5, "content of private messages") | correct |
| medical | silent (title gate + rule 5) | correct |

Bottom line: real mode is close to PASS once the issue 5 prompt edits are in. Mock mode fails until issues 1-3 are fixed.
