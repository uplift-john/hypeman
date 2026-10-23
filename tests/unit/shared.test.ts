import { describe, expect, it } from 'vitest';
import { categorise, contextFromTitle, fakeContext, subjectFromTitle } from '../../shared/context';
import { isNearDuplicate, normalise, remember, similarity } from '../../shared/dedupe';
import { SCREEN_FIXTURES } from '../../shared/fixtures';
import { postFilter } from '../../shared/postFilter';
import { FREQUENCY_DELAYS, errorBackoff, inQuietHours, nextDelay } from '../../shared/scheduler';
import { isSensitiveHint, lineLooksSensitive, usefulHint } from '../../shared/sensitive';
import { lumaDiff, toLuma } from '../../src/capture/pixelDiff';
import { seeded } from './harness';

describe('scheduler', () => {
  it('draws delays within each preset range', () => {
    const rng = seeded(1);
    for (const f of ['chill', 'normal', 'max'] as const) {
      for (let i = 0; i < 1000; i++) {
        const d = nextDelay(f, rng);
        expect(d).toBeGreaterThanOrEqual(FREQUENCY_DELAYS[f].minMs);
        expect(d).toBeLessThanOrEqual(FREQUENCY_DELAYS[f].maxMs);
      }
    }
  });

  it('clamps a misbehaving rng (≥1 or negative)', () => {
    expect(nextDelay('normal', () => 1.7)).toBeLessThanOrEqual(FREQUENCY_DELAYS.normal.maxMs);
    expect(nextDelay('normal', () => -3)).toBe(FREQUENCY_DELAYS.normal.minMs);
  });

  it('error backoff grows and is capped at ~30 min', () => {
    const r = () => 0;
    expect(errorBackoff(1, r)).toBe(2 * 60_000);
    expect(errorBackoff(2, r)).toBe(4 * 60_000);
    expect(errorBackoff(50, r)).toBe(30 * 60_000);
  });

  it('quiet hours handle same-day and overnight windows', () => {
    const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m);
    const day = { enabled: true, start: '09:00', end: '17:00' };
    expect(inQuietHours(day, at(8, 59))).toBe(false);
    expect(inQuietHours(day, at(9))).toBe(true);
    expect(inQuietHours(day, at(17))).toBe(false);
    const night = { enabled: true, start: '22:00', end: '08:00' };
    expect(inQuietHours(night, at(23))).toBe(true);
    expect(inQuietHours(night, at(3))).toBe(true);
    expect(inQuietHours(night, at(12))).toBe(false);
    expect(inQuietHours({ ...night, enabled: false }, at(23))).toBe(false);
    expect(inQuietHours({ enabled: true, start: 'garbage', end: '08:00' }, at(23))).toBe(false);
  });
});

describe('dedupe', () => {
  it('normalises case, punctuation and curly quotes', () => {
    expect(normalise('That’s GREAT, Q3 Forecast!')).toBe('thats great q3 forecast');
  });

  it('flags exact and near duplicates, not different lines', () => {
    const recent = ['Q3 Forecast is coming together beautifully. The revenue column looks sharp.'];
    expect(isNearDuplicate('Q3 forecast is coming together beautifully — the revenue column looks sharp!', recent)).toBe(true);
    expect(isNearDuplicate('Q3 Forecast is coming together nicely. The revenue column looks sharp.', recent)).toBe(true);
    expect(isNearDuplicate('Slide 7 of the Series A Pitch lands with real punch.', recent)).toBe(false);
    expect(similarity('a b c', 'x y z')).toBe(0);
  });

  it('remember keeps only the last 20', () => {
    let m: string[] = [];
    for (let i = 0; i < 30; i++) m = remember(m, `line ${i}`);
    expect(m).toHaveLength(20);
    expect(m[0]).toBe('line 10');
  });
});

describe('sensitive guards', () => {
  it('flags every sensitive fixture title and no safe fixture title', () => {
    for (const f of SCREEN_FIXTURES) expect(isSensitiveHint(f.title), f.id).toBe(f.sensitive);
  });

  it.each([
    'Chase — Account Statement',
    'Wells Fargo Online Banking',
    'PayPal: Summary',
    'Bitwarden Web Vault',
    'Sign in to your account',
    'MyChart - Test Results',
    'Hinge',
    '.env — api — Visual Studio Code',
    'Payroll — March pay stub',
  ])('title "%s" is sensitive', (t) => expect(isSensitiveHint(t)).toBe(true));

  it.each(['Q3 Forecast - Google Sheets', 'checkout.tsx — shop — Visual Studio Code', 'Onboarding v2 – Figma', 'WhatsApp', 'Messages', 'Zoom Meeting', 'Instagram', '', undefined])(
    'title "%s" is fine',
    (t) => expect(isSensitiveHint(t)).toBe(false),
  );

  it.each([
    'Your balance of $4,182.33 looks healthy!',
    'Love that 1,250.00 total.',
    'Card 4111 1111 1111 1111 is ready',
    'Great reply to sam@example.com',
    'Call +1 (415) 555-0100 back!',
    'Nice password manager setup',
    'Your bank account is thriving',
    'That prescription refill is handled',
  ])('line "%s" looks sensitive', (l) => expect(lineLooksSensitive(l)).toBe(true));

  it('ordinary hype lines pass', () => {
    expect(lineLooksSensitive('Q3 Forecast is coming together. The revenue column looks sharp.')).toBe(false);
    expect(lineLooksSensitive('Slide 7 lands with real punch.')).toBe(false);
  });

  it('opaque browser labels carry no hint', () => {
    expect(usefulHint('screen:0:0')).toBeUndefined();
    expect(usefulHint('web-contents-media-stream://12:3')).toBeUndefined();
    expect(usefulHint('window:1234:0')).toBeUndefined();
    expect(usefulHint('Q3 Forecast - Google Sheets')).toBe('Q3 Forecast - Google Sheets');
  });
});

describe('postFilter', () => {
  it('cleans emojis, quotes, extra exclamation marks and shouting', () => {
    const r = postFilter('"🔥 Q3 Forecast is AMAZING!!! That TOTAL column rocks! 🚀"', []);
    expect(r).toEqual({ ok: true, line: 'Q3 Forecast is Amazing! That Total column rocks.' });
  });

  it('rejects empty, too long, sensitive and duplicate lines (generic hype is fine now)', () => {
    expect(postFilter('   ', []).ok).toBe(false);
    expect(postFilter(Array(40).fill('word').join(' '), [])).toEqual({ ok: false, reason: 'too-long' });
    expect(postFilter('Noice!', [])).toEqual({ ok: true, line: 'Noice!' });
    expect(postFilter('That balance of $4,182 is impressive.', [])).toEqual({ ok: false, reason: 'sensitive-output' });
    expect(postFilter('Slide 7 lands with punch.', ['Slide 7 lands with punch!'])).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('context (mock mode)', () => {
  it('categorises common window titles', () => {
    expect(categorise('Q3 Forecast - Google Sheets')).toBe('sheet');
    expect(categorise('checkout.tsx — hypeshop — Visual Studio Code')).toBe('code');
    expect(categorise('Series A Pitch - Google Slides')).toBe('slides');
    expect(categorise('Launch Plan - Google Docs')).toBe('doc');
    expect(categorise('Onboarding v2 – Figma')).toBe('design');
    expect(categorise('Inbox (9) - Gmail')).toBe('email');
    expect(categorise('New Tab')).toBe('blank');
    expect(categorise('')).toBe('blank');
    expect(categorise('Some Random App')).toBeUndefined();
  });

  it('extracts a short subject', () => {
    expect(subjectFromTitle('Q3 Forecast - Google Sheets')).toBe('Q3 Forecast');
    expect(subjectFromTitle('checkout.tsx — hypeshop — Visual Studio Code')).toBe('checkout.tsx');
    expect(subjectFromTitle('● index.ts')).toBe('index.ts');
    expect(subjectFromTitle('x'.repeat(80)).length).toBeLessThanOrEqual(46);
  });

  it('never puts an email address into the subject for mail titles', () => {
    expect(contextFromTitle('Inbox (3) - me@example.com - Gmail', seeded(1))?.subject).toBe('your inbox');
  });

  it('falls back to a fake context with source "fake"', () => {
    expect(contextFromTitle(undefined, seeded(1))).toBeUndefined();
    expect(fakeContext(seeded(1)).source).toBe('fake');
  });
});

describe('pixel diff', () => {
  it('detects real change but ignores tiny noise', () => {
    const a = new Uint8ClampedArray(160 * 90).fill(100);
    const noisy = a.map((v, i) => (i % 50 === 0 ? v + 5 : v)); // compression noise
    expect(lumaDiff(a, noisy).active).toBe(false);
    const caret = a.map((v, i) => (i === 500 || i === 660 ? 20 : v)); // blinking caret: ~2 pixels
    expect(lumaDiff(a, caret).active).toBe(false);
    const typed = a.map((v, i) => (i >= 800 && i < 805) || (i >= 960 && i < 965) ? 40 : v); // one word typed
    expect(lumaDiff(a, typed).active).toBe(true);
    expect(lumaDiff(new Uint8ClampedArray(), new Uint8ClampedArray()).active).toBe(false);
  });

  it('converts RGBA to luma', () => {
    expect(Array.from(toLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])))).toEqual([255, 0]);
  });
});
