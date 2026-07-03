import { test, expect } from '@playwright/test';
import { blockWs } from '../e2e-browser/fixtures/block-ws';
import { setTheme, waitForMainHeading } from '../e2e-browser/fixtures/theme';

test.describe('Integration — UI against real backend proxy', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setTheme(page, 'dark');
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  test('dashboard loads through Vite proxy without API mocks', async ({ page }) => {
    await page.goto('/#/');
    await waitForMainHeading(page);
    await expect(page.locator('main h1')).toBeVisible();
    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });

  test('whales follow tab shows updated copy hint', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByText(/配置 POLYMARKET 凭据后可切换实盘|switch to live when Polymarket credentials/i).first()).toBeVisible();
  });
});
