import { expect, type Page } from '@playwright/test';
import { installFakeDisplay, type FakeDisplayMode } from './fakeDisplay';

export async function openApp(
  page: Page,
  opts: { screen?: string; mode?: FakeDisplayMode; theme?: 'light' | 'dark'; clock?: boolean; settings?: Record<string, unknown> } = {},
) {
  await installFakeDisplay(page, { screen: opts.screen, mode: opts.mode });
  if (opts.theme) await page.emulateMedia({ colorScheme: opts.theme });
  if (opts.settings) {
    await page.addInitScript((s) => {
      localStorage.setItem('hypeman.settings.v1', JSON.stringify(s));
    }, opts.settings);
  }
  if (opts.clock !== false) await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function startSession(page: Page) {
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.locator('#status-label')).toContainText(/Listening|Taking a look/);
}

export async function hypeNow(page: Page) {
  await page.getByTestId('hype-now').click();
}

/** Let real-time async work (fetch, video frames) settle while the fake clock is paused. */
export async function settle(page: Page, ms = 300) {
  await page.waitForTimeout(ms);
}

/**
 * Advance the fake clock while the fake screen keeps "changing": run in 20 s chunks and give the
 * real-time <video> pipeline a moment to pick up new canvas frames between idle-detection samples.
 */
export async function workFor(page: Page, ms: number) {
  for (let done = 0; done < ms; done += 20_000) {
    await page.clock.runFor(Math.min(20_000, ms - done));
    await page.waitForTimeout(60);
  }
}
