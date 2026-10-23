/**
 * QA review, iteration 1 — adversarial end-to-end tests.
 * Tests that expose real bugs are intentionally left failing (see review/iteration-1/reviews/qa.md).
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { hypeNow, openApp, settle, startSession } from './helpers';

const status = (page: Page) => page.locator('#status-label');
const feedItems = (page: Page) => page.getByTestId('feed').getByRole('listitem');
const okBody = (line: string) => JSON.stringify({ speak: true, line, reason: 'ok', mode: 'mock' });

/** Hold every /api/hype request until the test releases it. */
async function holdHype(page: Page) {
  const held: Route[] = [];
  await page.route('**/api/hype', (route) => {
    held.push(route);
  });
  return held;
}

test.describe('adversarial', () => {
  test('a slow model reply cannot shrink the 90 s gap: the gap counts from when the comment was shown', async ({ page }) => {
    const held = await holdHype(page);
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect.poll(() => held.length).toBe(1);
    // The model takes 34 s to answer (client timeout is 35 s).
    await page.clock.runFor(34_000);
    await held[0].fulfill({ status: 200, contentType: 'application/json', body: okBody('That Q3 Forecast tab is coming together nicely') });
    await expect(feedItems(page)).toHaveCount(1);
    // 60 s after the first comment appeared — still inside the 90 s gap.
    await page.clock.runFor(60_000);
    const btn = page.getByTestId('hype-now');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toContainText(/Next hype in 0:\d\d/);
  });

  test('server never answers: the client times out, shows one notice, and frees the button and slot', async ({ page }) => {
    const held = await holdHype(page);
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect.poll(() => held.length).toBe(1);
    await expect(page.getByTestId('hype-now')).toContainText('Taking a look');
    await page.clock.runFor(36_000);
    await expect(page.getByRole('alert')).toContainText('took too long');
    await expect(page.getByTestId('hype-now')).toContainText('Hype me now');
    await expect(page.getByTestId('window-meter')).toContainText('0 / 2');
    await expect(status(page)).toHaveText('Listening');
    for (const r of held) await r.abort().catch(() => {});
  });

  test('share revoked while a request is in flight: the late reply is dropped and nothing is recorded', async ({ page }) => {
    const held = await holdHype(page);
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect.poll(() => held.length).toBe(1);
    await page.evaluate(() => (window as unknown as { __fakeDisplay: { end(): void } }).__fakeDisplay.end());
    await expect(status(page)).toHaveText('Screen sharing stopped');
    await held[0].fulfill({ status: 200, contentType: 'application/json', body: okBody('That Q3 Forecast tab is coming together nicely') });
    await settle(page, 500);
    await expect(page.getByTestId('toast')).toBeHidden();
    await expect(feedItems(page)).toHaveCount(0);
    const deliveries = await page.evaluate(() => localStorage.getItem('hypeman.deliveries.v1'));
    expect(deliveries).toBeNull();
    await expect(page.getByText('Sharing screen')).toBeHidden();
  });

  test('reload mid-request does not burn a slot; reload after a comment keeps the 90 s gap', async ({ page }) => {
    let hold = true;
    const held: Route[] = [];
    await page.route('**/api/hype', (route) => (hold ? void held.push(route) : route.continue()));
    await openApp(page);
    await startSession(page);
    await hypeNow(page);
    await expect.poll(() => held.length).toBe(1);
    await page.reload();
    for (const r of held) await r.abort().catch(() => {});
    hold = false;
    await startSession(page);
    await expect(page.getByTestId('window-meter')).toContainText('0 / 2');
    await hypeNow(page);
    await expect(feedItems(page)).toHaveCount(1);
    // Reload right after a comment: the minimum gap must survive.
    await page.reload();
    await startSession(page);
    await expect(page.getByTestId('window-meter')).toContainText('1 / 2');
    const btn = page.getByTestId('hype-now');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toContainText(/Next hype in 1:\d\d/);
    for (let i = 0; i < 10; i++) await btn.click({ force: true });
    await settle(page, 300);
    await expect(feedItems(page)).toHaveCount(0); // feed is per-session; nothing new was said
  });

  test('two tabs open at once share one limit: a second tab cannot comment seconds after the first', async ({ page, context }) => {
    await openApp(page, { clock: false });
    const page2 = await context.newPage();
    await openApp(page2, { clock: false });
    await startSession(page);
    await startSession(page2);
    await hypeNow(page);
    await expect(feedItems(page)).toHaveCount(1);
    await page2.bringToFront();
    await hypeNow(page2);
    await settle(page2, 800);
    // The user has just been hyped by tab 1; tab 2 must respect the 90 s gap.
    await expect(feedItems(page2)).toHaveCount(0);
    await expect(page2.getByTestId('hype-now')).toContainText(/Next hype in/);
  });

  test('rapid pause/resume + hammering never yields more than one comment inside 90 s', async ({ page }) => {
    await openApp(page);
    await startSession(page);
    const btn = page.getByTestId('hype-now');
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('button', { name: 'Resume' }).click();
      await btn.click({ force: true });
      await btn.click({ force: true });
      await page.clock.runFor(5_000);
    }
    await settle(page, 300);
    await expect(feedItems(page)).toHaveCount(1);
    await expect(page.getByTestId('window-meter')).toContainText('1 / 2');
  });
});
