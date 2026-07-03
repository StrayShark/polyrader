import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

test.describe('Live trading UI (mock CLOB)', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');

    await page.route('**/api/whale-follow/trading-status**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { liveEnabled: true, canPlaceOrders: true },
        }),
      }),
    );

    await page.route('**/api/market-orders/status**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { liveEnabled: true, canPlaceOrders: true },
        }),
      }),
    );
  });

  test('copy follow panel exposes live mode toggle when credentials ready', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();
    await expect(page.getByRole('button', { name: /切换实盘|Switch to live/i })).toBeVisible();
    await expect(page.getByText(/纸面跟单|Paper Copy/i).first()).toBeVisible();
  });

  test('match detail shows live buy when trading status allows', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.route('**/api/market-orders/status**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { liveEnabled: true, canPlaceOrders: true } }),
      }),
    );
    await page.goto('/#/match/spirit-vs-g2-bo3');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /模拟决策|Simulated Decision/i }).click();
    await expect(page.getByRole('button', { name: /实盘买入.*Spirit|Live buy.*Spirit/i })).toBeVisible();
  });

  test('POST market order mock returns success payload', async ({ page }) => {
    await page.route('**/api/market-orders**', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            mode: 'live',
            orderId: 'ord-live-1',
            status: 'live',
            tokenId: 'token1',
            price: 0.65,
            size: 15,
            side: 'buy',
          },
        }),
      });
    });

    await page.goto('/#/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/market-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'spirit-vs-g2-bo3',
          side: 'buy',
          team: 'team_a',
          amountUsd: 10,
        }),
      });
      return { ok: res.ok, body: await res.json() as { data: { orderId: string } } };
    });

    expect(result.ok).toBe(true);
    expect(result.body.data.orderId).toBe('ord-live-1');
  });
});
