import { test, expect } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_LLM_E2E === '1';

test.skip(
  !enabled,
  'Set POLYRADER_REAL_LLM_E2E=1 to run live market and configured LLM checks',
);

/**
 * Real-data E2E test.
 *
 * This spec exercises the full stack against live Polymarket + configured LLMs:
 *   1. Ask the backend to refresh upcoming CS2 markets.
 *   2. Persist the first future CS2 market via the enrich endpoint.
 *   3. Visit the match detail page.
 *   4. Trigger AI analysis and wait for real LLM results.
 *
 * Requirements:
 *   - Run with `POLYRADER_REAL_LLM_E2E=1 npm run test:e2e:real-llm`.
 *   - At least one LLM provider must be configured in /api/ai/config/keys.
 *   - Polygon/Polymarket must be reachable.
 */

test.setTimeout(300000);

test('Real market data + live LLM analysis end-to-end', async ({ page }) => {
  // 1. Refresh real upcoming matches / markets
  const fetchResp = await page.request.post('/api/esports/fetch-upcoming');
  expect(fetchResp.ok()).toBe(true);
  const fetchBody = await fetchResp.json() as {
    data: {
      polymarketMarkets: Array<{
        conditionId: string;
        question: string;
        outcomes: string[];
        outcomePrices: string[];
        volume: number;
        endDate: string;
      }>;
    };
  };
  const markets = fetchBody.data.polymarketMarkets;
  expect(markets.length).toBeGreaterThan(0);

  // Pick the first future CS2 market
  const market = markets[0];

  // 2. Enrich & persist the match so analysis can load team data
  const enrichResp = await page.request.post('/api/esports/enrich', {
    data: {
      conditionId: market.conditionId,
      question: market.question,
      outcomes: market.outcomes,
      outcomePrices: market.outcomePrices,
      volume: market.volume,
      endDate: market.endDate,
    },
  });
  expect(enrichResp.ok()).toBe(true);

  // 3. Visit the match detail page
  await page.goto(`/#/match/${market.conditionId}`);
  await page.waitForSelector('main h1', { timeout: 20000 });

  // The match title should be visible
  const heading = page.locator('main h1');
  await expect(heading).toBeVisible();

  // 4. Open the AI analysis tab
  const aiTab = page.getByRole('tab', { name: /AI|分析/ }).first();
  await aiTab.click();

  // 5. Trigger real LLM analysis
  const analyzeButton = page.locator('main').getByRole('button', { name: /触发 LLM 分析|Trigger LLM Analysis/ }).first();
  await expect(analyzeButton).toBeVisible({ timeout: 10000 });
  await analyzeButton.click();

  // 6. Wait for a real provider result card to appear
  //    (The DOM shows provider name in the analysis results list.)
  const providerCell = page.locator('main').locator('text=/doubao|minimax|openai|anthropic|deepseek/i').first();
  await expect(providerCell).toBeVisible({ timeout: 120000 });

  // 7. Verify a result row contains a probability (e.g. 50.0%)
  const probText = page.locator('main').locator('text=/\\d+%/').first();
  await expect(probText).toBeVisible();
});
