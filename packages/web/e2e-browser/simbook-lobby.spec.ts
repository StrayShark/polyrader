import { test, expect } from '@playwright/test';
import { SAMPLE_MARKET, setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';

const REAL_ORDER_KEYWORDS = ['实盘下单', 'Live bet', '真实限价单', 'Real bet', 'Deposit', 'market-orders'];

test.describe('Simbook lobby', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows a concise bet slip and no real order entry on lobby', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: /赛事大厅|Event Lobby/ })).toBeVisible();
    await expect(page.getByTestId('desktop-bet-slip').getByText('投注单')).toBeVisible();
    await expect(page.getByText('Practice Mode')).toHaveCount(0);
    await expect(page.getByText('练习账户')).toHaveCount(0);

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
      page.getByRole('button', { name: /记录订单|Record Order/ }).click(),
    ]);
    expect(request.url()).toContain('/api/sim/bets');
  });

  test('keeps existing matches visible when a manual refresh fails', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('polyrader-hltv-intel-synced-at', String(Date.now()));
    });

    let marketRequests = 0;
    await page.route(/\/api\/markets(?:\?|$)/, (route) => {
      marketRequests++;
      if (marketRequests === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
        });
      }
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'External source unavailable' }),
      });
    });
    await page.route('**/api/esports/fetch-upcoming', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Refresh unavailable' }),
    }));

    await page.goto('/#/');
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();

    await page.getByRole('button', { name: /刷新|Refresh/, exact: true }).click();

    await expect(page.getByText(/已保留并显示本地赛事数据|Local event data remains visible/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /刷新|Refresh/, exact: true })).toBeEnabled();
  });

  test('match detail keeps odds in overview without a duplicate practice tab', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');

    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /G2 \d/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /模拟|Practice/ })).toHaveCount(0);

    const body = page.locator('body');
    for (const keyword of ['实盘下单', 'Live bet', 'market-orders']) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('expands map markets, adds a map leg, and shows RiskMeter metrics', async ({ page }) => {
    const series = {
      ...SAMPLE_MARKET,
      conditionId: 'local-seed-navi-faze-bo3',
      slug: 'local-seed-navi-faze-bo3',
      canonicalMatchId: 'match:seed-navi-faze',
      question: 'Counter-Strike: Natus Vincere vs FaZe Clan (BO3) - IEM Cologne Practice',
      outcomes: ['Natus Vincere', 'FaZe Clan'],
      outcomePrices: ['0.56', '0.44'],
      tags: ['cs2', 'practice', 'local-seed'],
      match: {
        matchId: 'local-seed-navi-faze-bo3',
        canonicalMatchId: 'match:seed-navi-faze',
        teamA: { teamId: 'seed-navi', name: 'Natus Vincere', rank: 4, logo: '', region: 'EU' },
        teamB: { teamId: 'seed-faze', name: 'FaZe Clan', rank: 7, logo: '', region: 'EU' },
        eventName: 'IEM Cologne Practice',
        eventType: 'LAN',
        format: 'BO3',
        scheduledAt: '2026-07-21T12:00:00Z',
        status: 'scheduled',
        maps: ['Mirage', 'Inferno', 'Nuke'],
      },
    };
    const mapMarkets = [1, 2, 3].map((mapNumber) => ({
      ...series,
      conditionId: `${series.conditionId}-map-${mapNumber}`,
      slug: `${series.conditionId}-map-${mapNumber}`,
      question: `Counter-Strike: Natus Vincere vs FaZe Clan (BO3) - IEM Cologne Practice - Map ${mapNumber} Winner`,
      tags: [...series.tags, 'map-winner'],
      match: { ...series.match, matchId: series.conditionId },
    }));

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [series, ...mapMarkets], total: 4 }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByText('+3')).toBeVisible();
    await page.getByRole('button', { name: /展开更多盘口|Expand more markets/i }).click();

    await expect(page.getByText(/地图 1 胜负|Map 1 Winner/)).toBeVisible();
    // Map row odds: 1 / 0.56 ≈ 1.79
    await page.getByRole('button', { name: /Natus Vincere 1\.79/ }).nth(1).click();

    const slip = page.getByTestId('desktop-bet-slip');
    await expect(slip.getByText(/风险纪律|Risk Discipline/)).toBeVisible();
    await expect(slip.getByText(/今日总风险|Daily Risk/)).toBeVisible();
    await expect(slip.getByText(/相关性|Correlation/)).toBeVisible();
    await expect(slip.getByText(/Kelly 偏离|Kelly deviation/)).toBeVisible();
  });

  test('shows clearable empty state when filters hide all matches', async ({ page }) => {
    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
      }),
    );

    await page.goto('/#/');
    await page.getByRole('button', { name: /^BO1$/ }).click();
    await expect(page.getByText(/暂无比赛数据|No match data available/)).toBeVisible();
    await expect(page.getByText(/没有匹配当前筛选|No practice markets match/)).toBeVisible();
    await page.getByRole('button', { name: /清除筛选|Clear filters/ }).first().click();
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();
  });
});
