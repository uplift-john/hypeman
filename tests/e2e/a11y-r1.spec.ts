/**
 * Accessibility review, iteration 1. Each test asserts the behaviour WCAG 2.2 AA / the brief
 * requires; a failing test is a finding. Run:
 *   HYPEMAN_E2E_WEB_PORT=5302 HYPEMAN_E2E_API_PORT=8902 npx playwright test --project=e2e tests/e2e/a11y-r1.spec.ts
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hypeNow, openApp, startSession } from './helpers';

const status = (page: Page) => page.locator('#status-label');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page: Page, label: string) {
  await page.waitForTimeout(700);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => `${label}: ${v.id} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Describe document.activeElement: 'BODY' when focus was dropped. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || !el.isConnected) return 'BODY';
    const name = el.getAttribute('aria-label') || el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40) || '';
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    return `${role}:${name}`;
  });
}

async function tabSequence(page: Page, n: number) {
  const seq: { id: string; visibleRing: boolean; visible: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    seq.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const name =
          el.getAttribute('aria-label') ||
          (el as HTMLInputElement).labels?.[0]?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30) ||
          el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30) ||
          el.tagName;
        // sr-only inputs draw their ring on the wrapping label / sibling track
        const target = el.getBoundingClientRect().width <= 1 ? (el.closest('label') as HTMLElement) ?? el : el;
        const peer = el.nextElementSibling as HTMLElement | null;
        const ringOf = (x: HTMLElement | null) => !!x && getComputedStyle(x).outlineStyle !== 'none' && parseFloat(getComputedStyle(x).outlineWidth) >= 1;
        const r = target.getBoundingClientRect();
        return {
          id: `${el.getAttribute('role') || el.tagName.toLowerCase()}:${name}`,
          visibleRing: ringOf(el) || ringOf(target) || ringOf(peer),
          visible: r.width > 0 && r.height > 0,
        };
      }),
    );
  }
  return seq;
}

// ── 1. axe on states the existing app.spec scan does not reach ────────────────────────────────
for (const theme of ['light', 'dark'] as const) {
  test(`axe: extra states (${theme})`, async ({ page }) => {
    const v: string[] = [];
    const hypeFail = { on: false };
    await page.route('**/api/hype', (route) =>
      hypeFail.on
        ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The Anthropic API returned an error (500).' }) })
        : route.continue(),
    );
    await openApp(page, { theme, settings: { theme, voiceOn: true, quietHours: { enabled: true, start: '03:00', end: '03:01' } } });
    await startSession(page);
    await page.getByRole('button', { name: 'Snooze' }).click();
    await page.getByRole('menuitem', { name: '30 minutes' }).click();
    await expect(status(page)).toHaveText('Snoozed');
    v.push(...(await axe(page, 'snoozed')));
    await page.getByRole('button', { name: 'Wake' }).click();
    hypeFail.on = true;
    await hypeNow(page);
    await expect(page.getByRole('alert')).toBeVisible();
    v.push(...(await axe(page, 'api-error-notice')));
    hypeFail.on = false;
    await page.getByRole('button', { name: 'Settings' }).click();
    v.push(...(await axe(page, 'settings-expanded')));
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __fakeDisplay: { end(): void } }).__fakeDisplay.end());
    await expect(status(page)).toHaveText('Screen sharing stopped');
    v.push(...(await axe(page, 'share-ended')));
    expect(v).toEqual([]);
  });
}

test('axe: 320px wide (400% zoom equivalent), dark, toast + feed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openApp(page, { theme: 'dark' });
  await startSession(page);
  await hypeNow(page);
  await expect(page.getByTestId('toast')).toBeVisible();
  expect(await axe(page, '320-toast')).toEqual([]);
});

// ── 2. contrast of every text token on every surface, both themes (computed from index.css) ────
test('token contrast: muted / accent-ink / danger text ≥ 4.5:1 on every surface; UI borders ≥ 3:1', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const block = (sel: RegExp) => {
    const m = css.match(sel)!;
    const out: Record<string, string> = {};
    for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[k] = v;
    return out;
  };
  const light = block(/:root \{([\s\S]*?)\n\}/);
  const dark = { ...light, ...block(/\[data-theme='dark'\] \{([\s\S]*?)\n\}/) };
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const text: [string, string][] = [
    ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'], ['muted', 'accent-soft'], ['muted', 'warn-soft'], ['muted', 'danger-soft'],
    ['text', 'danger-soft'], ['text', 'warn-soft'], ['text', 'accent-soft'],
    ['accent-text', 'bg'], ['accent-text', 'surface'], ['accent-text', 'accent-soft'],
    ['danger', 'surface'], ['danger', 'danger-soft'], ['on-accent', 'accent'], ['on-accent', 'accent-hover'],
  ];
  // 1.4.11: form-field boundaries (select / time inputs use --border on --surface inside --bg)
  const ui: [string, string][] = [['border-strong', 'surface'], ['border-strong', 'surface-2'], ['ring', 'bg'], ['ring', 'surface'], ['border', 'bg'], ['success', 'surface']];
  const fails: string[] = [];
  for (const [name, t] of [['light', light], ['dark', dark]] as const) {
    for (const [f, b] of text) { const r = ratio(t[f], t[b]); if (r < 4.5) fails.push(`${name} text ${f} on ${b} = ${r.toFixed(2)}`); }
    for (const [f, b] of ui) { const r = ratio(t[f], t[b]); if (r < 3) fails.push(`${name} non-text ${f} vs ${b} = ${r.toFixed(2)}`); }
  }
  console.log('contrast failures:', fails);
  expect(fails).toEqual([]);
});

// ── 3. tab order + visible focus on every screen ──────────────────────────────────────────────
test('tab order: start screen, every stop visible with a focus ring', async ({ page }) => {
  await openApp(page);
  const seq = await tabSequence(page, 4);
  console.log('start tab order', seq.map((s) => s.id));
  expect(seq.map((s) => s.id)[0]).toBe('button:Settings');
  expect(seq.some((s) => /Start session/.test(s.id))).toBe(true);
  expect(seq.filter((s) => !s.visible || !s.visibleRing).map((s) => s.id)).toEqual([]);
});

test('tab order: session (with toast) — logical, all reachable, all visible', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const seq = await tabSequence(page, 11);
  console.log('session tab order', seq.map((s) => s.id));
  const ids = seq.map((s) => s.id);
  const order = ['Settings', 'Hype', 'Pause', 'Snooze', 'Stop', 'Good one', 'Not for me', 'Dismiss comment'];
  let last = -1;
  for (const o of order) {
    const i = ids.findIndex((x, k) => k > last && x.includes(o));
    expect(i, `${o} after index ${last} in ${ids.join(' | ')}`).toBeGreaterThan(last);
    last = i;
  }
  expect(seq.filter((s) => !s.visible || !s.visibleRing).map((s) => s.id)).toEqual([]);
});

test('tab order: settings drawer — every control reachable with a visible ring', async ({ page }) => {
  await openApp(page, { settings: { voiceOn: true, quietHours: { enabled: true, start: '03:00', end: '03:01' } } });
  await page.getByRole('button', { name: 'Settings' }).click();
  const seq = await tabSequence(page, 14);
  console.log('drawer tab order', seq.map((s) => `${s.id}${s.visibleRing ? '' : ' (NO RING)'}`));
  expect(seq.filter((s) => !s.visible || !s.visibleRing).map((s) => s.id)).toEqual([]);
});

// ── 4. focus is never dropped to <body> ───────────────────────────────────────────────────────
test('focus: Pause → Resume swap keeps focus on the toggle', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Pause' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();
});

test('focus: after choosing a snooze duration, focus lands on Wake (not body)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Snooze' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // 15 minutes
  await expect(status(page)).toHaveText('Snoozed');
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: Wake → Snooze swap keeps focus', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Snooze' }).click();
  await page.getByRole('menuitem', { name: '15 minutes' }).click();
  await page.getByRole('button', { name: 'Wake' }).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Listening');
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: Stop moves focus somewhere meaningful (Start again / status)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Stop' }).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Session ended');
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: Start again lands in the new session (not body)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Start again' }).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Listening');
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: Back to start lands on the start screen (not body)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Back to start' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible();
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: share ended from browser while focus is on Pause → not dropped', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Pause' }).focus();
  await page.evaluate(() => (window as unknown as { __fakeDisplay: { end(): void } }).__fakeDisplay.end());
  await expect(status(page)).toHaveText('Screen sharing stopped');
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: permission denied → focus not dropped (alert or Start)', async ({ page }) => {
  await openApp(page, { mode: 'deny' });
  await page.getByRole('button', { name: 'Start session' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: dismissing the toast with its × button by keyboard → not dropped', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await page.getByRole('button', { name: 'Dismiss comment' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toBeHidden();
  expect(await focused(page)).not.toBe('BODY');
});

test('focus: toast auto-dismiss while focus is in it is held (focus holds the toast)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await page.getByTestId('toast').getByRole('button', { name: 'Good one' }).focus();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId('toast')).toBeVisible();
});

test('focus: drawer close restores focus to the opener DURING A LIVE SESSION', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  const opener = page.getByRole('button', { name: 'Settings' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('focus: drawer keeps focus where the user put it while the session ticks', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dlg = page.getByRole('dialog', { name: 'Settings' });
  await dlg.getByRole('radio', { name: 'Chill' }).focus();
  await page.clock.runFor(3_000); // the 1 s session tick re-renders App
  await expect(dlg.getByRole('radio', { name: 'Chill' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('focus: Hype me now keeps focus through thinking → limited states', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  const btn = page.getByTestId('hype-now');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(btn).toBeFocused();
});

// ── 5. live regions: announced, but not chatty ────────────────────────────────────────────────
async function watchLive(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __live: Record<string, string[]> };
    w.__live = {};
    const snap = () => {
      document.querySelectorAll<HTMLElement>('[aria-live],[role="status"],[role="alert"]').forEach((el, i) => {
        const key = el.id || el.getAttribute('role') || `live${i}`;
        const txt = el.textContent?.trim() ?? '';
        const arr = (w.__live[key] ??= []);
        if (arr[arr.length - 1] !== txt) arr.push(txt);
      });
    };
    new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    snap();
  });
}

test('live: the toast region is polite + atomic and contains the comment text', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  const region = page.locator('[role="status"][aria-live="polite"]').filter({ has: page.getByTestId('toast') });
  await expect(region).toHaveAttribute('aria-atomic', 'true');
  await expect(region).toContainText('Q3 Forecast');
});

test('live: rate-limit countdown is not re-announced every second', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await page.clock.runFor(95_000);
  await hypeNow(page);
  await expect(page.getByTestId('hype-now')).toHaveAttribute('aria-disabled', 'true');
  await watchLive(page);
  await page.clock.runFor(10_000);
  const live = await page.evaluate(() => (window as unknown as { __live: Record<string, string[]> }).__live);
  console.log('live-region updates over 10 s:', JSON.stringify(live['hype-help']?.slice(0, 4)), (live['hype-help'] ?? []).length);
  expect((live['hype-help'] ?? []).length).toBeLessThanOrEqual(2);
});

test('live: status h1 announces state changes only (not every tick)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Snooze' }).click();
  await page.getByRole('menuitem', { name: '15 minutes' }).click();
  await watchLive(page);
  await page.clock.runFor(10_000);
  const live = await page.evaluate(() => (window as unknown as { __live: Record<string, string[]> }).__live);
  expect((live['status-label'] ?? []).length).toBeLessThanOrEqual(1);
});

test('live: toast hover-hint text change does not re-announce the whole (atomic) toast', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await expect(page.getByTestId('toast')).toBeVisible();
  await watchLive(page);
  await page.getByTestId('toast').hover();
  await page.mouse.move(5, 5);
  const live = await page.evaluate(() => (window as unknown as { __live: Record<string, string[]> }).__live);
  console.log('toast region versions after hover in/out:', (live['status'] ?? []).length);
  expect((live['status'] ?? []).length).toBeLessThanOrEqual(1);
});

test('live: a comment that arrives while settings is open is still exposed to AT (not inside inert)', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const inert = await page.evaluate(() => !!document.querySelector('[role="status"][aria-live]')?.closest('[inert]'));
  expect(inert).toBe(false);
});

// ── 6. reduced motion ────────────────────────────────────────────────────────────────────────
test('reduced motion: toast, drawer, feed and pulse have no movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  const toastDur = await page.getByTestId('toast').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(toastDur).toBeLessThan(0.01);
  const li = await page.getByTestId('feed').getByRole('listitem').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(li).toBeLessThan(0.01);
  const pulses = await page.locator('.hm-pulse').evaluateAll((els) => els.map((el) => getComputedStyle(el, '::after').display));
  expect(pulses.every((d) => d === 'none')).toBe(true);
  await page.getByRole('button', { name: 'Settings' }).click();
  const drawer = await page.getByRole('dialog').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(drawer).toBeLessThan(0.01);
});

// ── 7. reflow / zoom / focus not obscured ────────────────────────────────────────────────────
for (const w of [320, 360, 640]) {
  test(`reflow at ${w}px: no horizontal scroll in session, snooze menu, settings`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 700 });
    const ok = async (l: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth), l).toBeLessThanOrEqual(w);
    await openApp(page);
    await ok('start');
    await startSession(page);
    await hypeNow(page);
    await ok('session');
    await page.getByRole('button', { name: 'Snooze' }).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(w);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings' }).click();
    await ok('settings');
  });
}

test('focus not obscured (2.4.11): toast never fully covers the focused feed control at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await page.clock.runFor(95_000);
  await hypeNow(page);
  await expect(page.getByTestId('toast')).toBeVisible();
  const covered: string[] = [];
  const btns = page.getByTestId('feed').getByRole('button');
  for (let i = 0; i < (await btns.count()); i++) {
    await btns.nth(i).focus();
    const hidden = await btns.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = document.querySelector('[data-testid="toast"]')!.getBoundingClientRect();
      return r.top >= t.top && r.bottom <= t.bottom && r.left >= t.left && r.right <= t.right;
    });
    if (hidden) covered.push(`feed button ${i}`);
  }
  console.log('covered by toast:', covered);
  expect(covered).toEqual([]);
});

// ── 8. names ─────────────────────────────────────────────────────────────────────────────────
test('names: reaction buttons are distinguishable per comment; persona radios have a group name', async ({ page }) => {
  await openApp(page);
  await startSession(page);
  await hypeNow(page);
  await page.clock.runFor(95_000);
  await hypeNow(page);
  const names = await page.getByTestId('feed').getByRole('button', { name: /Good one/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') + '|' + (e.getAttribute('aria-describedby') ?? '')));
  expect(new Set(names).size).toBe(names.length);
  await page.getByRole('button', { name: 'Settings' }).click();
  const grouped = await page.getByRole('dialog').locator('input[name="settings-persona"]').first().evaluate((el) => !!el.closest('fieldset,[role="radiogroup"]'));
  expect(grouped).toBe(true);
});
