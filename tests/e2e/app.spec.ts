import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { hypeNow, openApp, startSession, workFor } from './helpers';

const status = (page: Page) => page.locator('#status-label');

test.describe('onboarding', () => {
  test('one screen explains what it does, what it sees, what it never stores', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Get hyped');
    const privacy = page.getByRole('list', { name: 'Privacy' });
    await expect(privacy.getByRole('listitem')).toHaveCount(3);
    await expect(privacy).toContainText('You choose what it sees');
    await expect(privacy).toContainText('Nothing is stored');
    await expect(privacy).toContainText('Private stays private');
    await expect(page.getByText('Mock mode', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible();
  });

  test('permission denied shows a clear, recoverable error', async ({ page }) => {
    await openApp(page, { mode: 'deny' });
    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('alert')).toContainText('Screen sharing was blocked');
    await page.evaluate(() => (window as unknown as { __fakeDisplay: { setMode(m: string): void } }).__fakeDisplay.setMode('grant'));
    await startSession(page);
  });

  test('cancelling the picker is not treated as an error', async ({ page }) => {
    await openApp(page, { mode: 'cancel' });
    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('alert')).toContainText('No screen picked');
  });

  test('unsupported browser is explained', async ({ page }) => {
    await openApp(page, { mode: 'unsupported' });
    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page.getByRole('alert')).toContainText("can't share its screen");
  });
});

test.describe('session', () => {
  test('Hype me now → toast + feed + counter; toast auto-dismisses after ~8 s, hover holds it', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await expect(page.getByTestId('window-meter')).toContainText('0 / 2');
    await expect(page.getByTestId('next-hype')).toHaveText('Anytime in the next few minutes');
    await hypeNow(page);
    const toast = page.getByTestId('toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Q3 Forecast');
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(1);
    await expect(page.getByTestId('window-meter')).toContainText('1 / 2');

    await toast.hover();
    await page.clock.runFor(12_000);
    await expect(toast).toBeVisible();
    await page.mouse.move(5, 5);
    await page.clock.runFor(9_000);
    await expect(toast).toBeHidden();
  });

  test('2-per-10 limit: button shows a countdown and refuses further comments', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(1);
    // 90 s minimum gap
    await expect(page.getByTestId('hype-now')).toContainText(/Next hype in 1:\d\d/);
    await page.clock.runFor(95_000);
    await hypeNow(page);
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('window-meter')).toContainText('2 / 2');
    const btn = page.getByTestId('hype-now');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toContainText(/Next hype in [89]:\d\d/);
    await expect(page.getByTestId('next-hype')).toContainText('Limit reached');
    // hammer it
    for (let i = 0; i < 15; i++) await btn.click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(2);
    // the countdown actually counts down
    const before = await btn.innerText();
    await page.clock.runFor(5_000);
    await expect(btn).not.toHaveText(before);
  });

  test('an automatic comment arrives on its own within the Normal window', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await workFor(page, 11 * 60_000 + 5_000);
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(1, { timeout: 10_000 });
  });

  test('Pause / Resume and Snooze / Wake are one or two clicks and unambiguous', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(status(page)).toHaveText('Paused');
    await expect(page.getByText('Share paused')).toBeVisible();
    await expect(page.getByTestId('hype-now')).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(status(page)).toHaveText('Listening');

    await page.getByRole('button', { name: 'Snooze' }).click();
    await page.getByRole('menuitem', { name: '15 minutes' }).click();
    await expect(status(page)).toHaveText('Snoozed');
    await expect(page.getByTestId('status-desc')).toContainText('15:00 left');
    await page.getByRole('button', { name: 'Wake' }).click();
    await expect(status(page)).toHaveText('Listening');
  });

  test('Stop is instant and the session can be restarted', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(status(page)).toHaveText('Session ended');
    await expect(page.getByText('Sharing screen')).toBeHidden();
    await expect(page.getByTestId('feed').getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(status(page)).toHaveText('Listening');
  });

  test('screen share revoked from the browser ends the session cleanly', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await page.evaluate(() => (window as unknown as { __fakeDisplay: { end(): void } }).__fakeDisplay.end());
    await expect(status(page)).toHaveText('Screen sharing stopped');
    await expect(page.getByRole('button', { name: 'Start again' })).toBeVisible();
  });

  test('idle screen → Idle status and no automatic comment', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await page.evaluate(() => (window as unknown as { __fakeDisplay: { freeze(): void } }).__fakeDisplay.freeze());
    await page.clock.runFor(4 * 60_000);
    await expect(status(page)).toHaveText('Idle');
    await page.clock.runFor(20 * 60_000);
    await expect(page.getByText('Your first hype is on its way.')).toBeVisible();
  });

  test('bank statement screen → silence, with an explanation, and the slot is not used', async ({ page }) => {
    await openApp(page, { screen: 'bank' });
    await startSession(page);
    await hypeNow(page);
    await expect(page.locator('#hype-help')).toContainText('looks private');
    await expect(page.getByTestId('toast')).toBeHidden();
    await expect(page.getByTestId('window-meter')).toContainText('0 / 2');
    await page.clock.runFor(60 * 60_000);
    await expect(page.getByText('Your first hype is on its way.')).toBeVisible();
  });

  test('API errors show one calm notice, no crash, no spam', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/hype', (route) => {
      calls++;
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'The Anthropic API returned an error (500).' }) });
    });
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect(page.getByRole('alert')).toContainText('Hypeman hit a snag');
    await page.clock.runFor(30 * 60_000);
    expect(calls).toBeLessThanOrEqual(5);
    await expect(page.getByTestId('window-meter')).toContainText('0 / 2');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('reloading the page cannot reset the rate limit', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await page.clock.runFor(95_000);
    await hypeNow(page);
    await expect(page.getByTestId('window-meter')).toContainText('2 / 2');
    await page.reload();
    await startSession(page);
    await expect(page.getByTestId('window-meter')).toContainText('2 / 2');
    await expect(page.getByTestId('hype-now')).toHaveAttribute('aria-disabled', 'true');
  });

  test('reactions toggle and persist in history (no screen content stored)', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    const item = page.getByTestId('feed').getByRole('listitem').first();
    await item.getByRole('button', { name: 'Good one' }).click();
    await expect(item.getByRole('button', { name: 'Good one' })).toHaveAttribute('aria-pressed', 'true');
    const stored = await page.evaluate(() => Object.keys(localStorage));
    expect(stored.sort()).toEqual(['hypeman.deliveries.v1', 'hypeman.history.v1']);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('hypeman.history.v1')!));
    expect(history[0].reaction).toBe('up');
    expect(JSON.stringify(history)).not.toContain('data:image');
  });
});

test.describe('settings', () => {
  test('persist across reload; theme switches to dark', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const dlg = page.getByRole('dialog', { name: 'Settings' });
    await dlg.getByText('Coach').click();
    await dlg.getByText('Chill').click();
    await dlg.getByText('dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(dlg.getByRole('radio', { name: /Coach/ })).toBeChecked();
    await expect(dlg.getByRole('radio', { name: 'Chill' })).toBeChecked();
  });

  test('drawer traps focus and restores it on close', async ({ page }) => {
    await openApp(page);
    const opener = page.getByRole('button', { name: 'Settings' });
    await opener.click();
    await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside).toBe(true);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });
});

test.describe('accessibility', () => {
  test('keyboard only: start, hype, snooze, stop', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Start session' }).focus();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Listening');
    await page.getByTestId('hype-now').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('toast')).toBeVisible();
    const snooze = page.getByRole('button', { name: 'Snooze' });
    await snooze.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: '15 minutes' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '30 minutes' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(snooze).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Snoozed');
    await page.getByRole('button', { name: 'Stop' }).focus();
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Session ended');
  });

  test('toast is announced via a polite live region', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    const region = page.locator('[role="status"][aria-live="polite"]').filter({ has: page.getByTestId('toast') });
    await hypeNow(page);
    await expect(region).toHaveCount(1);
  });

  test('reduced motion disables animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    await startSession(page);
    const dur = await page.locator('.hm-pulse').first().evaluate((el) => getComputedStyle(el, '::after').display);
    expect(dur).toBe('none');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe: no violations on every screen (${theme})`, async ({ page }) => {
      const scan = async (label: string) => {
        await page.waitForTimeout(700); // let entrance animations (real-time CSS) finish
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(r.violations.map((v) => `${label}: ${v.id} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      };
      await openApp(page, { theme, mode: 'deny' });
      await scan('start');
      await page.getByRole('button', { name: 'Start session' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await scan('start-error');
      await page.evaluate(() => (window as unknown as { __fakeDisplay: { setMode(m: string): void } }).__fakeDisplay.setMode('grant'));
      await startSession(page);
      await scan('session-empty');
      await hypeNow(page);
      await expect(page.getByTestId('toast')).toBeVisible();
      await page.waitForTimeout(400);
      await scan('session-toast');
      await page.clock.runFor(95_000);
      await hypeNow(page);
      await scan('session-limit');
      await page.getByRole('button', { name: 'Snooze' }).click();
      await scan('snooze-menu');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Pause' }).click();
      await scan('paused');
      await page.getByRole('button', { name: 'Settings' }).click();
      await scan('settings');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Stop' }).click();
      await scan('ended');
    });
  }

  test('no horizontal overflow at 360px on any screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await openApp(page);
    await noOverflow();
    await startSession(page);
    await hypeNow(page);
    await noOverflow();
    await page.getByRole('button', { name: 'Settings' }).click();
    await noOverflow();
  });
});
