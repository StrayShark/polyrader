import { expect, test } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Unified account workspace', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  });

  test('keeps ledger, simulation, paper orders, performance, and review in one route-level page', async ({
    page,
  }) => {
    const requestedModules = new Set<string>();
    page.on('request', (request) => {
      if (request.url().includes('/api/simulation/')) requestedModules.add('simulation');
      if (request.url().includes('/api/sim/bets')) requestedModules.add('orders');
      if (request.url().includes('/api/performance/summary')) requestedModules.add('performance');
      if (request.url().includes('/api/sim/reviews')) requestedModules.add('review');
    });

    await page.goto('/#/bankroll');
    const tabs = page.getByTestId('account-workspace-tabs');
    await expect(page.getByRole('heading', { name: '我的账本' })).toBeVisible();
    await expect(tabs.getByRole('tab')).toHaveCount(5);
    await expect(tabs.getByRole('tab', { name: '概览' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(requestedModules.size).toBe(0);

    await tabs.getByRole('tab', { name: '策略参数' }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=simulation$/);
    await expect(tabs.getByRole('tab', { name: '策略参数' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('订单风控')).toBeVisible();
    await expect.poll(() => [...requestedModules].sort()).toEqual(['performance', 'simulation']);

    await tabs.getByRole('tab', { name: '订单', exact: true }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=orders$/);
    await expect(tabs.getByRole('tab', { name: '订单', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('paper-orders-page')).toBeVisible();
    await expect
      .poll(() => [...requestedModules].sort())
      .toEqual(['orders', 'performance', 'simulation']);

    await tabs.getByRole('tab', { name: '绩效' }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=performance$/);
    await expect(page.getByTestId('performance-page')).toBeVisible();
    await expect
      .poll(() => [...requestedModules].sort())
      .toEqual(['orders', 'performance', 'simulation']);

    await tabs.getByRole('tab', { name: '复盘', exact: true }).click();
    await expect(page).toHaveURL(/#\/bankroll\?section=review$/);
    await expect(tabs.getByRole('tab', { name: '复盘', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('已结算注单')).toBeVisible();
    await expect
      .poll(() => [...requestedModules].sort())
      .toEqual(['orders', 'performance', 'review', 'simulation']);
  });

  test('redirects legacy module routes to their account tabs', async ({ page }) => {
    await page.goto('/#/simulation');
    await expect(page).toHaveURL(/#\/bankroll\?section=simulation$/);

    await page.goto('/#/review');
    await expect(page).toHaveURL(/#\/bankroll\?section=review$/);
  });
});
