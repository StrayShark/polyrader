import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

const MOCK_REVIEW_DETAIL = {
  bet: {
    id: 'bet-1',
    accountId: 'default',
    betType: 'single',
    stake: 100,
    totalOdds: 1.8,
    userProbability: 0.6,
    edge: 0.08,
    result: 'won',
    pnl: 80,
    status: 'settled',
    matchId: 'spirit-vs-g2-bo3',
    marketId: 'm1',
    placedAt: '2026-06-25T10:00:00Z',
    settledAt: '2026-06-26T10:00:00Z',
  },
  legs: [
    {
      id: 'leg-1',
      betId: 'bet-1',
      matchId: 'spirit-vs-g2-bo3',
      marketId: 'm1',
      selection: 'Spirit',
      odds: 1.8,
      result: 'won',
    },
  ],
  review: null,
  snapshots: [
    {
      id: 'snap-1',
      matchId: 'spirit-vs-g2-bo3',
      marketId: 'm1',
      selection: 'Spirit',
      odds: 1.8,
      capturedAt: '2026-06-25T10:00:00Z',
    },
  ],
  closingOdds: 1.7,
  brierScore: 0.16,
  closingLineValue: -0.0314,
};

const MOCK_REVIEW_SUMMARY = {
  totalSettled: 1,
  winRate: 1,
  totalPnl: 80,
  avgBrier: 0.16,
  avgClv: -0.0314,
  avgRoi: 0.8,
  maxDrawdown: 0,
  errorTagStats: [{ tag: 'overrated_favorite', count: 1, totalPnl: 80, avgBrier: 0.16 }],
  errorTagTrend: [{
    periodStart: '2026-06-22',
    periodLabel: '06/22-06/28',
    tag: 'overrated_favorite',
    count: 1,
    totalPnl: 80,
  }],
  byFormat: [{ key: 'BO3', count: 1, winRate: 1, totalPnl: 80 }],
  byTier: [{ key: 'unknown', count: 1, winRate: 1, totalPnl: 80 }],
  suggestions: [
    {
      id: 'need_more_samples',
      severity: 'info',
      messageKey: 'review.suggestion_needMoreSamples',
      params: { count: 1 },
    },
  ],
};

const MOCK_RESULT_RESPONSE = {
  contractVersion: 'bet-review-response.v1',
  analysisId: 'bra-review-e2e',
  betId: 'bet-1',
  verdict: {
    decisionQuality: 'good_process_good_result',
    processScore: 0.78,
    confidence: 'medium',
    summary: 'The probability estimate was reasonably calibrated and the result was favorable.',
  },
  attribution: {
    primary: 'market_price',
    factors: [
      {
        code: 'NEGATIVE_CLV',
        category: 'market_price',
        impact: 'negative',
        evidenceIds: ['metric:outcome-quality'],
        summary: 'The entry price was slightly worse than the recorded closing line.',
      },
    ],
  },
  calibration: {
    brierScore: 0.16,
    assessment: 'acceptable',
    summary: 'The supplied Brier score is acceptable for this sample.',
  },
  priceQuality: {
    closingLineValue: -0.0314,
    assessment: 'lost_to_close',
    summary: 'The entry did not beat the closing line.',
  },
  riskDiscipline: {
    assessment: 'within_policy',
    reasonCodes: ['STAKE_WITHIN_LIMIT'],
    summary: 'No risk-policy breach is present in the supplied evidence.',
  },
  lessons: [
    {
      code: 'IMPROVE_ENTRY_PRICE',
      priority: 'medium',
      action: 'Track price movement before entry and compare it with the closing line.',
    },
  ],
  suggestedErrorTags: [],
  summary: 'Keep the probability process, but improve entry-price discipline.',
};

const MOCK_RESULT_ARTIFACT = {
  id: 'result-analysis-1',
  betId: 'bet-1',
  status: 'valid',
  contractVersion: 'bet-review.v1',
  promptVersion: 'bet-review.v1.0.0',
  responseSchemaVersion: 'bet-review-response.v1',
  provider: 'test-provider',
  model: 'test-model',
  promptHash: 'sha256:review-e2e-hash',
  systemPrompt: 'Review only the supplied INPUT and return valid JSON.',
  inputJson: JSON.stringify({
    contractVersion: 'bet-review.v1',
    analysisId: 'bra-review-e2e',
    bet: { betId: 'bet-1', status: 'settled' },
    metrics: { brierScore: 0.16, closingLineValue: -0.0314 },
  }),
  outputSchemaJson: JSON.stringify({
    type: 'object',
    properties: { contractVersion: { const: 'bet-review-response.v1' } },
  }),
  rawResponse: JSON.stringify(MOCK_RESULT_RESPONSE),
  normalizedResponseJson: JSON.stringify(MOCK_RESULT_RESPONSE),
  validationErrors: [],
  response: MOCK_RESULT_RESPONSE,
  latencyMs: 42,
  createdAt: '2026-06-26T10:01:00Z',
  updatedAt: '2026-06-26T10:01:01Z',
};

test.describe('Review page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.route('**/api/sim/reviews/summary**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_REVIEW_SUMMARY }),
      }),
    );

    await page.route('**/api/sim/reviews**', (route) => {
      if (route.request().url().includes('/reviews/summary')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_REVIEW_SUMMARY }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_REVIEW_DETAIL] }),
      });
    });

    await page.route('**/api/sim/bets/*/review', (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'review-1',
              betId: 'bet-1',
              errorTags: body?.errorTags ?? [],
              note: body?.note ?? null,
              brierScore: 0.16,
              closingLineValue: body?.closingOdds ? -0.0294 : null,
              createdAt: '2026-06-26T10:00:00Z',
              updatedAt: '2026-06-26T10:00:00Z',
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_REVIEW_DETAIL }),
      });
    });

    let resultArtifact: typeof MOCK_RESULT_ARTIFACT | null = null;
    await page.route('**/api/sim/bets/*/result-analysis', (route) => {
      if (route.request().method() === 'POST') {
        resultArtifact = MOCK_RESULT_ARTIFACT;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: resultArtifact }),
        });
      }
      if (!resultArtifact) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Bet result analysis not found' } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: resultArtifact }),
      });
    });
  });

  test('lists settled bets and opens review dialog', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');

    await expect(page.getByRole('heading', { name: /模拟盘|Sim Trading/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /复盘|Review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('cell', { name: /spirit-vs-g2/ })).toBeVisible();
    await expect(page.getByText('$100.00').first()).toBeVisible();
    await expect(page.getByTestId('review-tag-trend')).toContainText(/标签趋势|Tag trend/);
    await expect(page.getByTestId('review-tag-trend')).toContainText(/高估热门|Overrated Favorite/);

    await page
      .getByRole('button', { name: /复盘|Review/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Brier Score/)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/复盘时间线|Review Timeline/)).toBeVisible();
    const timeline = page.getByTestId('review-timeline');
    await expect(timeline.locator('ol')).toBeVisible();
    await expect(timeline.getByTestId('review-timeline-item')).toHaveCount(5);
    await expect(timeline.getByTestId('review-timeline-dot')).toHaveCount(5);
    await expect(timeline.getByTestId('review-timeline-rail')).toHaveCount(4);
    await expect(timeline.getByTestId('review-timeline-item').nth(3)).toHaveAttribute('data-tone', 'green');
  });

  test('saves review with error tags and note', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');
    await page
      .getByRole('button', { name: /复盘|Review/ })
      .first()
      .click();

    await page.getByPlaceholder(/收盘赔率|Closing Odds/).fill('1.75');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /高估热门|Overrated Favorite/ })
      .click();
    await page
      .getByPlaceholder(/记录这单|Record key takeaways/)
      .fill('Ignored map pool disadvantage');

    const savePromise = page.waitForRequest(
      (req) => req.url().includes('/api/sim/bets/') && req.method() === 'POST',
    );
    await page.getByRole('button', { name: /保存复盘|Save Review/ }).click();

    const postRequest = await savePromise;
    await expect(page.getByRole('dialog')).toBeHidden();

    const body = postRequest.postDataJSON();
    expect(body.closingOdds).toBe(1.75);
    expect(body.errorTags).toContain('overrated_favorite');
    expect(body.note).toContain('Ignored map pool');
  });

  test('generates and inspects a standardized LLM result analysis', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');
    await page
      .getByRole('button', { name: /复盘|Review/ })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/LLM 结果分析|LLM Result Analysis/)).toBeVisible();

    const requestPromise = page.waitForRequest(
      (request) => request.url().includes('/result-analysis') && request.method() === 'POST',
    );
    await dialog.getByRole('button', { name: /生成分析|Generate analysis/ }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toMatchObject({ force: false });

    await expect(dialog.getByText(/过程良好，结果良好|Good process, good result/)).toBeVisible();
    await expect(dialog.getByText(/过程评分 78%|Process score 78%/)).toBeVisible();
    await expect(dialog.getByText('Brier 0.160')).toBeVisible();
    await expect(dialog.getByText('CLV -0.031')).toBeVisible();
    await expect(dialog.getByText('NEGATIVE_CLV', { exact: true })).toBeVisible();

    await dialog.getByText(/查看标准化输入输出|Inspect standardized artifacts/).click();
    await expect(dialog.getByText(/标准输入（bet-review.v1）|Standard input \(bet-review.v1\)/)).toBeVisible();
    await expect(dialog.getByText(/bet-review-response.v1/).first()).toBeVisible();
  });

  test('has no real trading CTA', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');
    const main = page.locator('main');
    for (const keyword of ['实盘下单', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(main).not.toContainText(keyword);
    }
  });
});
