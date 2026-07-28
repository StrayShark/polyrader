import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Bankroll page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows practice account summary and no real trading CTA', async ({ page }) => {
    await page.goto('/#/bankroll');

    await expect(page.getByRole('heading', { name: /模拟盘|Sim Trading/ })).toBeVisible();
    await expect(page.getByText('初始本金').first()).toBeVisible();
    await expect(page.getByText('总权益').first()).toBeVisible();
    await expect(page.getByText('可用余额').first()).toBeVisible();
    await expect(page.getByText('今日盈亏').first()).toBeVisible();

    // Risk metrics
    await expect(page.getByText('未结算暴露').first()).toBeVisible();
    await expect(page.getByText('最大回撤').first()).toBeVisible();
    await expect(page.getByText('胜率').first()).toBeVisible();

    const body = page.locator('body');
    for (const keyword of ['实盘下单', 'Live bet', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('switches equity curve granularity', async ({ page }) => {
    await page.goto('/#/bankroll');

    const weekTab = page.getByRole('tab', { name: /周|Week/ });
    await weekTab.click();
    await expect(weekTab).toHaveAttribute('aria-selected', 'true');

    const monthTab = page.getByRole('tab', { name: /月|Month/ });
    await monthTab.click();
    await expect(monthTab).toHaveAttribute('aria-selected', 'true');
  });

  test('shows the market, selection, and odds instead of only an id', async ({ page }) => {
    await page.route('**/api/sim/bankroll**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          account: {
            id: 'default',
            name: 'Practice Account',
            initialBankroll: 10000,
            currentBankroll: 10000,
            availableBankroll: 9900,
            openExposure: 100,
            maxSingleRiskPct: 0.02,
            maxDailyRiskPct: 0.06,
            createdAt: '2026-06-01T00:00:00Z',
            updatedAt: '2026-06-25T10:00:00Z',
          },
          todayPnl: 0,
          openExposure: 100,
          equityCurve: [],
          openBets: [{
            id: 'sim-bet-readable',
            accountId: 'default',
            matchId: '2396006',
            matchName: 'Spirit vs G2 · IEM Cologne',
            marketId: 'm1',
            betType: 'single',
            stake: 100,
            totalOdds: 1.8,
            status: 'open',
            result: null,
            pnl: 0,
            game: 'cs2',
            marketKind: 'match_winner',
            placedAt: '2026-06-26T10:00:00Z',
            legs: [{
              id: 'sim-leg-readable',
              betId: 'sim-bet-readable',
              matchId: '2396006',
              marketId: 'm1',
              selection: 'Spirit',
              odds: 1.8,
              createdAt: '2026-06-26T10:00:00Z',
            }],
          }],
          settledBets: [],
          voidedBets: [],
          riskMetrics: {
            maxDrawdown: 0,
            maxDrawdownPct: 0,
            consecutiveLosses: 0,
            averageStake: 100,
            totalBets: 0,
            winRate: 0,
            roi: 0,
          },
        },
      }),
    }));

    await page.goto('/#/bankroll');
    const summary = page.getByTestId('bet-market-summary-sim-bet-readable');
    await expect(summary).toContainText('Spirit vs G2 · IEM Cologne');
    await expect(summary).toContainText('比赛胜负');
    await expect(summary).toContainText('Spirit @ 1.80');
    await expect(summary).toContainText('ID m1');
  });
});
