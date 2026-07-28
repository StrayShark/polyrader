import { expect, test, type Page } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';
import { blockWs } from './fixtures/block-ws';

async function openLegacySimulation(page: Page) {
  await page.goto('/#/simulation');
  await expect(page).toHaveURL(/#\/bankroll\?section=simulation$/);
  await expect(page.getByRole('heading', { name: '模拟盘' })).toBeVisible();
}

test.describe('Legacy simulation route', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  });

  test('redirects to the canonical simulation tab', async ({ page }) => {
    await openLegacySimulation(page);
    await expect(page.getByRole('tab', { name: '策略参数' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('订单风控')).toBeVisible();
  });

  test('renders deterministic paper controls without a real-trading action', async ({ page }) => {
    await openLegacySimulation(page);
    await expect(page.getByText('启用自动策略')).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /真实下单|真实成交/ })).toHaveCount(0);
  });

  test('renders canonical performance metrics and equity curve', async ({ page }) => {
    await page.goto('/#/bankroll?section=performance');
    await expect(page.getByTestId('performance-page')).toBeVisible();
    await expect(page.getByTestId('performance-filters')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await expect(
      page.getByTestId('performance-page').getByRole('table').getByText('minimax'),
    ).toBeVisible();
  });

  test('loads local simulation configuration and performance inputs', async ({ page }) => {
    const simulationRequests = new Set<string>();
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/simulation/')) simulationRequests.add(pathname);
    });
    await openLegacySimulation(page);
    await expect
      .poll(() => [...simulationRequests].sort())
      .toEqual([
        '/api/simulation/config',
        '/api/simulation/equity-curve/all',
        '/api/simulation/stats',
      ]);
  });
});
