import { expect, test } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';

test.describe('Smart wallet tracking', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  });

  test('refresh runs ingestion and reports discovered high-win-rate wallets', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);

    const refreshRequest = page.waitForRequest((request) => (
      request.url().includes('/api/whales/refresh') && request.method() === 'POST'
    ));
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await refreshRequest;

    await expect(page.getByText(/新增 8 笔成交/)).toBeVisible();
    await expect(page.getByText(/发现 12 个候选钱包/)).toBeVisible();
    await expect(page.getByText(/5 个达到高胜率门槛/)).toBeVisible();
  });

  test('filters the high-win-rate leaderboard by rate, sample size, and ROI', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: '高胜率钱包', exact: true }).click();

    await expect(page.getByText('聪明钱排行榜')).toBeVisible();
    await expect(page.getByLabel('最低胜率')).toHaveValue('0.6');
    await expect(page.getByLabel('最少样本')).toHaveValue('10');
    await expect(page.getByLabel('最低 ROI')).toHaveValue('0.02');
    await expect(page.locator('span.tabular-nums.text-xs').filter({ hasText: /^65%$/ })).toBeVisible();
    await expect(page.getByText('24', { exact: true })).toBeVisible();
    await expect(page.getByText('18.0%')).toBeVisible();
  });

  test('applies common copy presets in paper mode', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: '关注跟单', exact: true }).click();

    await expect(page.getByTestId('copy-strategy-high_win_rate')).toBeVisible();
    await expect(page.getByTestId('copy-strategy-large_trade_momentum')).toBeVisible();
    await expect(page.getByTestId('copy-strategy-conservative')).toBeVisible();
    await expect(page.getByTestId('copy-strategy-diversified')).toBeVisible();

    const configRequest = page.waitForRequest((request) => (
      request.url().includes('/api/whale-follow/config') && request.method() === 'PUT'
    ));
    await page.getByTestId('copy-strategy-high_win_rate').click();
    const request = await configRequest;
    expect(request.postDataJSON()).toEqual(expect.objectContaining({
      mode: 'paper',
      minLeaderWinRate: 0.65,
      minLeaderRoi: 0.05,
      minLeaderSamples: 30,
      maxOrderUsd: 100,
    }));
  });
});
