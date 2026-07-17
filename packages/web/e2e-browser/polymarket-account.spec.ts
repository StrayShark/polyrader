import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';

test.describe('Polymarket Account page', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.unroute('**/api/system/features**');
    await page.route('**/api/system/features**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { marketOrdersEnabled: false, liveTradingEnabled: false, polymarketAccountEnabled: true },
        }),
      }),
    );
  });

  test('renders connection, trading stats, equity curve, balances, positions, and orders', async ({ page }) => {
    await page.goto('/#/polymarket/account');
    await waitForMainHeading(page);
    await expect(page.locator('main h1')).toBeVisible();

    await expect(page.getByText('连接状态').or(page.getByText('Connection'))).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('0x1234...cdef')).toBeVisible();
    await expect(page.getByText('胜率', { exact: true }).or(page.getByText('Win Rate', { exact: true }))).toBeVisible();
    await expect(page.getByText('50.0%')).toBeVisible();
    await expect(page.getByText('历史交易额', { exact: true }).or(page.getByText('Historical Volume', { exact: true }))).toBeVisible();
    await expect(page.getByText('资产曲线', { exact: true }).or(page.getByText('Equity Curve', { exact: true }))).toBeVisible();
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
    await expect(page.getByText('Spirit vs G2').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();

    const errorCount = await page.locator('text=Something went wrong').count();
    expect(errorCount).toBe(0);
  });
});
