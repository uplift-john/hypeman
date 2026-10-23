import { expect, test } from '@playwright/test';
import { hypeNow, openApp, startSession } from './helpers';

test('smoke: start, hype, toast', async ({ page }) => {
  await openApp(page, { screen: 'sheet' });
  await page.screenshot({ path: 'review/_scratch/start.png', fullPage: true });
  await startSession(page);
  await hypeNow(page);
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.screenshot({ path: 'review/_scratch/session.png', fullPage: true });
});
