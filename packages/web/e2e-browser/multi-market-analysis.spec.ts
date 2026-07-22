import { expect, test } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { SAMPLE_MARKET, setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';

test.describe('Multi-market analysis and liquidity warnings', () => {
  test('shows handicap, totals, model divergence, and observe-only low liquidity state', async ({ page }) => {
    await blockWs(page);
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');

    await page.getByRole('tab', { name: /AI/ }).click();
    await page.getByRole('button', { name: /触发 LLM 分析|Trigger LLM Analysis/ }).click();

    const panel = page.getByTestId('multi-market-analysis');
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/让分盘|Handicap/).first()).toBeVisible();
    await expect(panel.getByText(/大小分|Totals/).first()).toBeVisible();
    await expect(panel.getByText(/存在模型偏差|Model Divergence/)).toBeVisible();
    await expect(panel.getByText(/仅观察|Observe Only/)).toBeVisible();
    await expect(panel.getByTestId('low-liquidity-warning')).toContainText(/650/);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });

  test('warns in the lobby when external market liquidity is below $1,000', async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.route(/\/api\/markets(?:\?|$)/, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ ...SAMPLE_MARKET, liquidity: 650 }], total: 1 }),
    }));

    await page.goto('/#/');

    const warning = page.getByTestId('low-liquidity-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/650/);
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeEnabled();
  });
});
