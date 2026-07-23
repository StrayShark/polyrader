import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

test.describe('Whale follow & copy trading', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('shows follow tab with paper copy notice and config', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    await expect(page.getByText(/纸面跟单|Paper Copy Trading/i).first()).toBeVisible();
    await expect(page.getByText(/跟单配置|Copy Trading Config/i).first()).toBeVisible();
    await expect(page.getByText(/已关注钱包|Followed Wallets/i).first()).toBeVisible();
    await expect(page.getByText(/跟单信号|Copy Signals/i).first()).toBeVisible();
    await expect(page.getByText(/纸面模式|Paper/i).first()).toBeVisible();
  });

  test('shows same-block latency disclaimer', async ({ page }) => {
    await page.goto('/#/whales');
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByText(/无法.*同区块|cannot copy in the same block/i).first()).toBeVisible();
  });

  test('leaderboard rows expose follow star control', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await expect(page.getByTitle(/关注|Follow/i).first()).toBeVisible();
  });

  test('follow star toggles followed wallet list', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/whale-follow') && resp.request().method() === 'POST'),
      page.getByTitle(/关注|Follow/i).first().click(),
    ]);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByText(/0xabc1\.\.\.f456/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('copy signal execute adds paper trade row', async ({ page }) => {
    await page.route('**/api/whale-follow/signals?limit=**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'sig-1',
            leaderAddress: '0xabc123def456',
            leaderTxHash: '0xtx1',
            tokenId: 'token1',
            side: 'buy',
            leaderAmount: 5000,
            leaderPrice: 0.6,
            suggestedAmount: 50,
            status: 'pending',
            marketQuestion: 'Spirit vs G2',
            createdAt: '2026-06-25T10:00:00Z',
          }],
        }),
      });
    });

    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await page.getByRole('button', { name: /纸面执行|Paper execute/i }).click();
    await expect(page.getByText(/paper\/filled/i)).toBeVisible({ timeout: 5000 });
  });

  test('auto copy mode toggle is available in copy config', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByRole('button', { name: /自动跟单|Auto Copy|手动确认|Manual Confirm/i }).first()).toBeVisible();
  });

  test('copy trade summary renders when settled trades exist', async ({ page }) => {
    await page.route('**/api/whale-follow/trades/summary**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { totalPnl: 120, settled: 4, wins: 3, losses: 1 },
        }),
      }),
    );

    await page.goto('/#/whales');
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByText(/\+\$120|120/).first()).toBeVisible();
    await expect(page.getByText(/4/).first()).toBeVisible();
  });

  test('whale detail page loads from leaderboard link', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('link', { name: /0xabc1/i }).first().click();
    await expect(page.getByText(/按市场拆分|By Market/i).first()).toBeVisible({ timeout: 5000 });
  });
});
