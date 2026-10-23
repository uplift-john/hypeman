import { expect, test, type Page } from '@playwright/test';
import { hypeNow, openApp, startSession } from './helpers';

/**
 * Captures every screen in light/dark × 1280/360 into review/<HYPEMAN_SHOTS_DIR>/.
 * Run with: HYPEMAN_SHOTS_DIR=iteration-1 npm run screenshots
 */
const DIR = `review/${process.env.HYPEMAN_SHOTS_DIR ?? 'latest'}`;
const fd = (page: Page, fn: string, arg?: string) =>
  page.evaluate(([f, a]) => (window as unknown as { __fakeDisplay: Record<string, (x?: string) => void> }).__fakeDisplay[f!](a), [fn, arg]);

type Shot = { name: string; setup: (page: Page) => Promise<void>; full?: boolean };

const SHOTS: Shot[] = [
  { name: '01-onboarding', setup: async () => {} },
  {
    name: '02-permission-denied',
    setup: async (page) => {
      await fd(page, 'setMode', 'deny');
      await page.getByRole('button', { name: 'Start session' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  { name: '03-listening-empty', setup: startSession },
  {
    name: '04-comment-toast',
    setup: async (page) => {
      await startSession(page);
      await hypeNow(page);
      await expect(page.getByTestId('toast')).toBeVisible();
    },
  },
  {
    name: '05-limit-hit',
    setup: async (page) => {
      await startSession(page);
      await hypeNow(page);
      await expect(page.getByTestId('toast')).toBeVisible();
      await page.clock.runFor(95_000);
      await fd(page, 'setScreen', 'slides');
      await hypeNow(page);
      await expect(page.getByTestId('window-meter')).toContainText('2 / 2');
      await page.clock.runFor(9_000);
      await expect(page.getByTestId('toast')).toBeHidden();
    },
    full: true,
  },
  {
    name: '06-paused',
    setup: async (page) => {
      await startSession(page);
      await page.getByRole('button', { name: 'Pause' }).click();
    },
  },
  {
    name: '07-snooze-menu',
    setup: async (page) => {
      await startSession(page);
      await page.getByRole('button', { name: 'Snooze' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
    },
  },
  {
    name: '08-snoozed',
    setup: async (page) => {
      await startSession(page);
      await page.getByRole('button', { name: 'Snooze' }).click();
      await page.getByRole('menuitem', { name: '30 minutes' }).click();
    },
  },
  {
    name: '09-idle',
    setup: async (page) => {
      await startSession(page);
      await fd(page, 'freeze');
      await page.clock.runFor(4 * 60_000);
      await expect(page.locator('#status-label')).toHaveText('Idle');
    },
  },
  {
    name: '10-silent-private-screen',
    setup: async (page) => {
      await fd(page, 'setScreen', 'bank');
      await startSession(page);
      await hypeNow(page);
      await expect(page.locator('#hype-help')).toContainText('private');
    },
  },
  {
    name: '11-api-error',
    setup: async (page) => {
      await page.route('**/api/hype', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"The Anthropic API returned an error (500)."}' }));
      await startSession(page);
      await hypeNow(page);
      await expect(page.getByText('Hypeman hit a snag')).toBeVisible();
    },
  },
  {
    name: '12-share-ended',
    setup: async (page) => {
      await startSession(page);
      await hypeNow(page);
      await page.clock.runFor(9_000);
      await fd(page, 'end');
      await expect(page.locator('#status-label')).toHaveText('Screen sharing stopped');
    },
  },
  {
    name: '13-settings',
    setup: async (page) => {
      await startSession(page);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('dialog').getByText('Enable quiet hours').click();
    },
  },
];

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 360]) {
    for (const shot of SHOTS) {
      test(`${shot.name} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 360 ? 780 : 860 });
        await openApp(page, { theme });
        await shot.setup(page);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${DIR}/${shot.name}--${theme}-${width}.png`, fullPage: shot.full ?? false, animations: 'disabled' });
      });
    }
  }
}
