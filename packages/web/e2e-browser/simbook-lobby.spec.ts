import { test, expect } from '@playwright/test';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';

const REAL_ORDER_KEYWORDS = ['实盘下单', 'Live bet', '真实限价单', 'Real bet', 'Deposit', 'market-orders'];

test.describe('Simbook lobby', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows practice mode and no real order entry on lobby', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: /赛事大厅|Event Lobby/ })).toBeVisible();
    await expect(page.getByTestId('desktop-bet-slip').getByText('模拟投注单')).toBeVisible();

    const body = page.locator('body');
    for (const keyword of REAL_ORDER_KEYWORDS) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('adds a match winner selection to practice slip in two clicks', async ({ page }) => {
    await page.goto('/#/');

    // First click: odds button for Team A (decimal odds ~1.54 from mock price 0.65)
    const oddsButton = page.getByRole('button', { name: /Spirit \d/ });
    await expect(oddsButton).toBeVisible();
    await oddsButton.click();

    // Second interaction: the slip shows the selection
    await expect(page.getByText('Spirit').nth(1)).toBeVisible();

    // Submit should call /api/sim/bets, not real order endpoints
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/sim/bets') && req.method() === 'POST'),
      page.getByRole('button', { name: /提交模拟下注|Submit Practice Bet/ }).click(),
    ]);
    expect(request.url()).toContain('/api/sim/bets');
  });

  test('match detail has practice tab and no live bet button', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');

    await page.getByRole('tab', { name: /模拟|Practice/ }).click();
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /G2 \d/ })).toBeVisible();

    const body = page.locator('body');
    for (const keyword of ['实盘下单', 'Live bet', 'market-orders']) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('shows the wrapped LLM aggregation after analysis', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');

    await page.getByRole('tab', { name: 'AI' }).click();
    await page.getByRole('button', { name: /触发 LLM 分析|Run LLM Analysis/ }).click();

    await expect(page.getByText('62.0%', { exact: true })).toBeVisible();
    await expect(page.getByText('openai', { exact: true })).toBeVisible();
  });
});
