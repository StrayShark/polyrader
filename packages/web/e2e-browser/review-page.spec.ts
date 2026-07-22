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
  errorTagStats: [],
  byFormat: [{ key: 'BO3', count: 1, winRate: 1, totalPnl: 80 }],
  byTier: [{ key: 'unknown', count: 1, winRate: 1, totalPnl: 80 }],
  suggestions: [{
    id: 'need_more_samples',
    severity: 'info',
    messageKey: 'review.suggestion_needMoreSamples',
    params: { count: 1 },
  }],
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
  });

  test('lists settled bets and opens review dialog', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');

    await expect(page.getByRole('heading', { name: /我的账本|My Ledger/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /复盘中心|Review Center/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('cell', { name: /spirit-vs-g2/ })).toBeVisible();
    await expect(page.getByText('$100.00').first()).toBeVisible();

    await page.getByRole('button', { name: /复盘|Review/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Brier Score/)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/复盘时间线|Review Timeline/)).toBeVisible();
  });

  test('saves review with error tags and note', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');
    await page.getByRole('button', { name: /复盘|Review/ }).first().click();

    await page.getByPlaceholder(/收盘赔率|Closing Odds/).fill('1.75');
    await page.getByRole('dialog').getByRole('button', { name: /高估热门|Overrated Favorite/ }).click();
    await page.getByPlaceholder(/记录这单|Record key takeaways/).fill('Ignored map pool disadvantage');

    const savePromise = page.waitForRequest((req) => req.url().includes('/api/sim/bets/') && req.method() === 'POST');
    await page.getByRole('button', { name: /保存复盘|Save Review/ }).click();

    const postRequest = await savePromise;
    await expect(page.getByRole('dialog')).toBeHidden();

    const body = postRequest.postDataJSON();
    expect(body.closingOdds).toBe(1.75);
    expect(body.errorTags).toContain('overrated_favorite');
    expect(body.note).toContain('Ignored map pool');
  });

  test('has no real trading CTA', async ({ page }) => {
    await page.goto('/#/bankroll?section=review');
    const main = page.locator('main');
    for (const keyword of ['实盘下单', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(main).not.toContainText(keyword);
    }
  });
});
