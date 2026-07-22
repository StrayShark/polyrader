import { expect, test } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Unified account workspace', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));

  });

  test('keeps portfolio, paper orders, performance, and review in one route-level page', async ({ page }) => {
    const requestedModules = new Set<string>();
    page.on('request', (request) => {
      if (request.url().includes('/api/sim/bets')) requestedModules.add('orders');
      if (request.url().includes('/api/performance/summary')) requestedModules.add('performance');
      if (request.url().includes('/api/sim/reviews')) requestedModules.add('review');
    });

    await page.goto('/#/bankroll');
    const tabs = page.getByTestId('account-workspace-tabs');
    await expect(page.getByRole('heading', { name: '我的账本' })).toBeVisible();
    await expect(tabs.getByRole('tab')).toHaveCount(4);
    await expect(tabs.getByRole('tab', { name: '我的账本' })).toHaveAttribute('aria-selected', 'true');
    expect(requestedModules.size).toBe(0);

    await tabs.getByRole('tab', { name: '模拟订单' }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=orders$/);
    await expect(tabs.getByRole('tab', { name: '模拟订单' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('paper-orders-page')).toBeVisible();
    await expect.poll(() => [...requestedModules].sort()).toEqual(['orders']);

    await tabs.getByRole('tab', { name: '绩效' }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=performance$/);
    await expect(page.getByTestId('performance-page')).toBeVisible();
    await expect.poll(() => [...requestedModules].sort()).toEqual(['orders', 'performance']);

    await tabs.getByRole('tab', { name: '复盘中心' }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=review$/);
    await expect(tabs.getByRole('tab', { name: '复盘中心' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('已结算注单')).toBeVisible();
    await expect.poll(() => [...requestedModules].sort()).toEqual(['orders', 'performance', 'review']);
  });

  test('redirects legacy module routes to their account tabs', async ({ page }) => {
    await page.goto('/#/simulation');
    await expect(page).toHaveURL(/#\/bankroll\?section=simulation$/);

    await page.goto('/#/review');
    await expect(page).toHaveURL(/#\/bankroll\?section=review$/);
  });
});
