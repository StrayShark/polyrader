import { expect, test, type Page } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';
import { blockWs } from './fixtures/block-ws';

async function openLegacySimulation(page: Page) {
  await page.goto('/#/simulation');
  await expect(page).toHaveURL(/#\/bankroll\?section=simulation$/);
  await expect(page.getByRole('heading', { name: '我的账本' })).toBeVisible();
}

test.describe('Legacy simulation route', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  });

  test('redirects to the canonical paper-orders tab', async ({ page }) => {
    await openLegacySimulation(page);
    await expect(page.getByRole('tab', { name: '模拟订单' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('paper-orders-page')).toBeVisible();
  });

  test('renders deterministic paper orders without a real-trading control', async ({ page }) => {
    await openLegacySimulation(page);
    await expect(page.getByText('还没有符合条件的模拟订单')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByText('不会触发真实成交')).toBeVisible();
  });

  test('renders canonical performance metrics and equity curve', async ({ page }) => {
    await page.goto('/#/bankroll?section=performance');
    await expect(page.getByTestId('performance-page')).toBeVisible();
    await expect(page.getByText('绩效与校准')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await expect(page.getByText('MINIMAX')).toBeVisible();
  });

  test('does not load the removed provider simulation configuration', async ({ page }) => {
    const legacyRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/simulation/')) legacyRequests.push(request.url());
    });
    await openLegacySimulation(page);
    await expect.poll(() => legacyRequests).toEqual([]);
  });
});
