# Deploying Hypeman

Hypeman deploys as a normal website: the React app plus its small API (Claude comments, ElevenLabs voice, sign-in) as one serverless function. On a real https site you get live screen sharing, automatic comments and the live ElevenLabs voice — none of the limits of the hosted Claude page.

## Vercel (recommended) — about 5 minutes

1. **Import the repo.** In Vercel: *Add New → Project → Import* `uplift-john/hypeman`. Vercel reads `vercel.json`; leave the framework as "Other" and don't change the build settings.
2. **Add environment variables** (*Settings → Environment Variables*, Production):

   | Variable | Required | What |
   |---|---|---|
   | `HYPEMAN_ACCESS_CODES` | **yes** | Who can sign in, as `name:passcode` pairs, comma-separated — e.g. `john:pick-a-long-one,sam:another-one`. The site refuses to start without it, so nobody can spend your API credits. |
   | `HYPEMAN_SESSION_SECRET` | **yes** | Any random string of 32+ characters (signs the sign-in cookie). Generate one with `openssl rand -base64 32`. |
   | `ANTHROPIC_API_KEY` | for real comments | Without it the site runs on canned lines. |
   | `ELEVENLABS_API_KEY` | for the real voice | Without it the browser's own voice is used. |
   | `ELEVENLABS_VOICE_ID` | optional | Pins the voice. Unset: Hypeman auto-picks a young American "gym bro" voice from the ElevenLabs Voice Library (adds it to your account as "Hypeman"), falling back to the premade American "Liam". Or pick one in the app: Settings → Voice. |
   | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | recommended | Makes the daily caps exact across all serverless instances. Easiest: *Storage → Create → Upstash Redis* in Vercel, which adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically (also accepted). |
   | `HYPEMAN_DAILY_HYPES_PER_USER` | optional | Claude calls per person per day (default 150). |
   | `HYPEMAN_DAILY_HYPES_TOTAL` | optional | Claude calls per day across everyone — your spending ceiling (default 1500). |
   | `HYPEMAN_DAILY_VOICE_PER_USER` / `HYPEMAN_DAILY_VOICE_TOTAL` | optional | ElevenLabs calls (defaults 300 / 3000). |

3. **Deploy.** Every push to the repo redeploys automatically; every branch gets its own preview URL.

### Cost ceiling, roughly
Each comment is one Claude Sonnet call with a ~1024px screenshot (≈1.5–2k input tokens, tiny output) — on the order of half a cent. The default overall cap of 1,500/day keeps worst-case Claude spend in single-digit dollars per day. ElevenLabs bills by characters; lines are ~20 characters and repeats are cached per instance.

## Any Node host (Railway, Render, Fly)

`npm start` builds the frontend and serves app + API from one process on `$PORT`. Set the same environment variables; with `HYPEMAN_ACCESS_CODES` set it listens publicly, without it it stays on localhost.

## What changes when it's public

- People sign in with their passcode once (30-day cookie). Settings → Sign out.
- Paid calls are capped per person per day and overall; when a cap is hit Hypeman says so and pauses until tomorrow (UTC).
- `/privacy.html` explains what's sent where; link it wherever you share Hypeman.
