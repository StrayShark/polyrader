import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

const MOCK_SIGNAL = {
  marketId: '0xcs2_1',
  polymarketProb: 0.65,
  predictedProb: 0.62,
  finalProb: 0.63,
  edge: 0.02,
  deviation: 0.03,
  recommendation: 'skip',
  arbitrageOpportunity: false,
  signals: [
    { source: 'polymarket', probability: 0.65, confidence: 0.9, lastUpdated: '2026-06-25T10:00:00Z' },
    { source: 'prediction_model', probability: 0.62, confidence: 0.8, lastUpdated: '2026-06-25T10:00:00Z' },
  ],
};

test.describe('Strategy Lab page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.route('**/api/signals/0xcs2_1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_SIGNAL }),
      }),
    );
  });

  test('renders tabs and probability lab empty state', async ({ page }) => {
    await page.goto('/#/strategy');

    await expect(page.getByRole('heading', { name: /策略实验室|Strategy Lab/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /概率实验室|Probability Lab/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /信号权重|Signal Weights/ })).toBeVisible();

    await expect(page.getByText(/选择一个市场后|Select a market/)).toBeVisible();
  });

  test('selects a market and shows probability bars', async ({ page }) => {
    await page.goto('/#/strategy');

    await page.locator('select').selectOption('0xcs2_1');
    await expect(page.getByText('Polymarket').first()).toBeVisible();
    await expect(page.getByText('Model').first()).toBeVisible();
  });

  test('signal weights tab shows backtest table and tuning inputs', async ({ page }) => {
    await page.goto('/#/strategy');
    await page.getByRole('tab', { name: /信号权重|Signal Weights/ }).click();

    await expect(page.getByText(/历史回测与校准|Historical Backtest/)).toBeVisible();
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
  });

  test('has no real trading CTA', async ({ page }) => {
    await page.goto('/#/strategy');
    const main = page.locator('main');
    for (const keyword of ['实盘下单', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(main).not.toContainText(keyword);
    }
  });
});
