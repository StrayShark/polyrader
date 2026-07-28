import { test, expect } from '@playwright/test';
import { SAMPLE_MARKET, setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { setTheme } from './fixtures/theme';

const REAL_ORDER_KEYWORDS = [
  '实盘下单',
  'Live bet',
  '真实限价单',
  'Real bet',
  'Deposit',
  'market-orders',
];

test.describe('Simbook lobby', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows read-only lobby odds and no order entry on lobby', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: /总览|Overview/ })).toBeVisible();
    await expect(page.getByTestId('desktop-bet-slip')).toHaveCount(0);
    await expect(page.getByText('Practice Mode')).toHaveCount(0);
    await expect(page.getByText('练习账户')).toHaveCount(0);

    const body = page.locator('body');
    for (const keyword of REAL_ORDER_KEYWORDS) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('keeps lobby odds read-only instead of adding practice selections', async ({ page }) => {
    await page.goto('/#/');

    const oddsQuote = page.getByTestId('odds-quote').filter({ hasText: '1.54' }).first();
    await expect(oddsQuote).toBeVisible();
    await expect(page.getByTestId('desktop-bet-slip')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /记录订单|Record Order/ })).toHaveCount(0);
  });

  test('filters lobby markets below $1,000 total liquidity', async ({ page }) => {
    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            SAMPLE_MARKET,
            {
              ...SAMPLE_MARKET,
              conditionId: 'low-liquidity-market',
              slug: 'low-liquidity-market',
              question: 'Counter-Strike: Low Float vs Thin Book (BO3) - Micro Cup',
              liquidity: 999,
            },
          ],
          total: 2,
        }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('match-team-row').filter({ hasText: 'Spirit' })).toBeVisible();
    await expect(page.getByText('Low Float')).toHaveCount(0);
    await expect(page.getByText('Micro Cup')).toHaveCount(0);
  });

  test('recovers when the first desktop startup market request races the sidecar', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('polyrader-hltv-intel-synced-at', String(Date.now()));
    });
    let marketRequests = 0;
    await page.route(/\/api\/markets(?:\?|$)/, (route) => {
      marketRequests += 1;
      if (marketRequests <= 2) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Load failed' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
      });
    });

    await page.goto('/#/');
    await expect(page.getByText('Load failed')).toHaveCount(0);
    await expect(page.getByTestId('match-odds-row')).toHaveCount(1);
    expect(marketRequests).toBeGreaterThanOrEqual(3);
  });

  test('uses a compact two-team multi-market card layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/');

    const cards = page.getByTestId('match-odds-row');
    await expect(cards).toHaveCount(1);
    const card = cards.first();
    await expect(card.getByTestId('match-card-meta')).toBeVisible();
    await expect(card.getByTestId('match-team-row')).toHaveCount(2);
    await expect(card.getByTestId('team-logo')).toHaveCount(0);
    await expect(card.getByTestId('odds-quote')).toHaveCount(2);
    await expect(card.getByTestId('market-liquidity')).toBeVisible();
    await expect(card.getByTestId('odds-quote').first()).not.toContainText('Spirit');
    await expect(card.getByTestId('odds-quote').last()).not.toContainText('G2');
    await expect(card.getByTestId('odds-quote').first()).toHaveAttribute(
      'aria-label',
      /Spirit 1\.54/,
    );

    const quoteStyle = await card.getByTestId('odds-quote').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderRadius: style.borderRadius,
        height: style.height,
        width: style.width,
        background: style.backgroundColor,
        variant: element.getAttribute('data-variant'),
      };
    });
    expect(quoteStyle.borderRadius).not.toBe('0px');
    expect(quoteStyle.height).toBe('32px');
    expect(quoteStyle.width).toBe('80px');
    expect(quoteStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(quoteStyle.variant).toBe('secondary');

    const metaLayout = await card.getByTestId('match-card-meta').evaluate((element) => {
      const title = element.querySelector<HTMLElement>('[data-testid="match-title"]');
      const date = element.querySelector<HTMLElement>('[data-testid="match-date"]');
      if (!title || !date) throw new Error('Missing match title or date');
      return {
        titleRight: title.getBoundingClientRect().right,
        dateLeft: date.getBoundingClientRect().left,
        dateFollowsTitle: Boolean(
          title.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(metaLayout.dateFollowsTitle).toBe(true);
    expect(metaLayout.dateLeft).toBeGreaterThanOrEqual(metaLayout.titleRight);

    const liquidityStyle = await card.getByTestId('market-liquidity').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        borderWidth: style.borderWidth,
        height: style.height,
      };
    });
    expect(liquidityStyle.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(liquidityStyle.borderWidth).toBe('0px');
    expect(liquidityStyle.height).toBe('20px');

    const scrollStyle = await card.getByTestId('market-odds-scroll').evaluate((element) => ({
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    }));
    expect(scrollStyle.overflowX).toBe('auto');
    expect(scrollStyle.scrollbarWidth).toBe('none');

    const rowCenters = await card.getByTestId('match-team-row').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }),
    );
    const quoteCenters = await card
      .locator('[data-market-category="match_winner"]')
      .getByTestId('odds-quote')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top + rect.height / 2;
        }),
      );
    expect(rowCenters).toHaveLength(2);
    expect(quoteCenters).toHaveLength(2);
    expect(Math.abs(rowCenters[0] - quoteCenters[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(rowCenters[1] - quoteCenters[1])).toBeLessThanOrEqual(1);
    await expect(card.getByTestId('ai-analyzed-badge')).toHaveCount(0);
    await expect(card.getByTestId('ai-analyzed-badge-mobile')).toHaveCount(0);
    await expect(card.getByTestId('data-ready-signal')).toHaveAttribute('data-state', 'off');
    await expect(card.getByTestId('llm-analysis-signal')).toHaveAttribute('data-state', 'off');
  });

  test('shows independent data-ready and LLM-analysis signal lights', async ({ page }) => {
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const teamDetails = (teamId: string, name: string) => ({
      teamId,
      name,
      logo: '',
      rank: 10,
      region: 'EU',
      players: [],
      recentForm: {
        last10Matches: [],
        winRate: 0.5,
        streak: 0,
        averageRating: 1,
      },
      mapPool: { maps: [] },
      headToHead: [],
    });
    const dataReadyMarket = {
      ...SAMPLE_MARKET,
      conditionId: 'data-ready-market',
      slug: 'data-ready-alpha-beta',
      question: 'Counter-Strike: Alpha Ready vs Beta Ready (BO3) - Signal Cup',
      outcomes: ['Alpha Ready', 'Beta Ready'],
      match: {
        matchId: 'data-ready-match',
        teamA: { teamId: 'alpha-ready', name: 'Alpha Ready', rank: 10, logo: '', region: 'EU' },
        teamB: { teamId: 'beta-ready', name: 'Beta Ready', rank: 12, logo: '', region: 'EU' },
        eventName: 'Signal Cup',
        eventType: 'LAN',
        format: 'BO3',
        scheduledAt,
        status: 'scheduled',
        teamDetails: {
          teamA: teamDetails('alpha-ready', 'Alpha Ready'),
          teamB: teamDetails('beta-ready', 'Beta Ready'),
          source: 'database',
          isComplete: true,
        },
      },
    };
    const llmReadyMarket = {
      ...SAMPLE_MARKET,
      conditionId: 'llm-ready-market',
      slug: 'llm-ready-gamma-delta',
      question: 'Counter-Strike: Gamma LLM vs Delta LLM (BO3) - Signal Cup',
      outcomes: ['Gamma LLM', 'Delta LLM'],
    };

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [dataReadyMarket, llmReadyMarket], total: 2 }),
      }),
    );
    await page.route(/\/api\/analysis\/runs(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              matchId: 'llm-ready-match',
              marketId: 'llm-ready-market',
              status: 'decision_ready',
              validationStatus: 'valid',
            },
          ],
        }),
      }),
    );

    await page.goto('/#/');
    const dataCard = page.getByTestId('match-odds-row').filter({ hasText: 'Alpha Ready' });
    const llmCard = page.getByTestId('match-odds-row').filter({ hasText: 'Gamma LLM' });
    await expect(dataCard.getByTestId('data-ready-signal')).toHaveAttribute('data-state', 'on');
    await expect(dataCard.getByTestId('llm-analysis-signal')).toHaveAttribute('data-state', 'off');
    await expect(llmCard.getByTestId('data-ready-signal')).toHaveAttribute('data-state', 'off');
    await expect(llmCard.getByTestId('llm-analysis-signal')).toHaveAttribute('data-state', 'on');

    const lampStyles = await dataCard.locator('[data-testid$="-lamp"]').evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          width: style.width,
          height: style.height,
          borderRadius: style.borderRadius,
        };
      }),
    );
    expect(lampStyles).toHaveLength(2);
    expect(lampStyles.every((style) => style.width === '8px' && style.height === '8px')).toBe(true);
    expect(lampStyles.every((style) => style.borderRadius !== '0px')).toBe(true);
    await expect(page.getByTestId('ai-analyzed-badge')).toHaveCount(0);
  });

  test('keeps one card column when the content area is narrow', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/#/');

    const grid = page.getByTestId('lobby-market-grid');
    await expect(grid).toBeVisible();
    const columnCount = await grid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length,
    );
    expect(columnCount).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
  });

  test('groups handicap markets into the same match card without using the market prefix as a team', async ({
    page,
  }) => {
    const jdgWinner = {
      ...SAMPLE_MARKET,
      conditionId: 'lol-match-winner-market',
      slug: 'jdg-team-we',
      question: 'League of Legends: JDG vs Team WE (BO3) - LPL Group Ascend',
      outcomes: ['JDG', 'Team WE'],
      outcomePrices: ['0.62', '0.38'],
      tags: ['lol', 'polymarket'],
      liquidity: 12_000,
      endDate: '2026-07-25T10:00:00Z',
    };
    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            jdgWinner,
            {
              ...jdgWinner,
              conditionId: 'lol-handicap-market',
              slug: 'jdg-team-we-handicap',
              question: 'Game Handicap: JDG (-1.5) vs Team WE (+1.5)',
              outcomes: ['JDG (-1.5)', 'Team WE (+1.5)'],
              outcomePrices: ['0.4', '0.6'],
              tags: ['lol', 'polymarket'],
              liquidity: 10_000,
            },
          ],
          total: 2,
        }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('match-odds-row')).toHaveCount(1);
    await expect(page.getByText('LPL Group Ascend')).toBeVisible();
    await expect(page.getByText(/让分|Handicap/)).toBeVisible();
    await expect(page.getByText('Game Handicap: JDG')).toHaveCount(0);
    await expect(page.getByTestId('market-odds-grid')).toBeVisible();
    await expect(page.getByText('-1.5')).toBeVisible();
    await expect(page.getByTestId('odds-quote').filter({ hasText: '2.50' })).toBeVisible();
  });

  test('hides resolved-looking matches and only removes an extreme derived market', async ({
    page,
  }) => {
    const extremeHandicap = {
      ...SAMPLE_MARKET,
      conditionId: 'spirit-g2-resolved-handicap',
      slug: 'spirit-g2-resolved-handicap',
      question: 'Game Handicap: Spirit (-1.5) vs G2 (+1.5)',
      outcomes: ['Spirit (-1.5)', 'G2 (+1.5)'],
      outcomePrices: ['0.0005', '0.9995'],
      liquidity: 10_000,
    };
    const resolvedWinner = {
      ...SAMPLE_MARKET,
      conditionId: 'resolved-match-winner',
      slug: 'closed-one-vs-closed-two',
      question: 'Counter-Strike: Closed One vs Closed Two (BO3) - Completed Cup',
      outcomes: ['Closed One', 'Closed Two'],
      outcomePrices: ['0.995', '0.005'],
      liquidity: 20_000,
    };

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [SAMPLE_MARKET, extremeHandicap, resolvedWinner],
          total: 3,
        }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('match-odds-row')).toHaveCount(1);
    await expect(page.getByText('Closed One')).toHaveCount(0);
    await expect(page.getByText(/让分|Handicap/)).toHaveCount(0);
    await expect(page.getByTestId('odds-quote')).toHaveCount(2);
    await expect(page.getByText('2000.00')).toHaveCount(0);
  });

  test('shows CS2, LoL, Dota 2, and Valorant markets without game filters', async ({ page }) => {
    const markets = [
      SAMPLE_MARKET,
      {
        ...SAMPLE_MARKET,
        conditionId: 'lol-market',
        slug: 't1-vs-gen-g',
        question: 'League of Legends: T1 vs Gen.G (BO3) - LCK Summer',
        outcomes: ['T1', 'Gen.G'],
        tags: ['lol', 'polymarket'],
        liquidity: 12_345,
      },
      {
        ...SAMPLE_MARKET,
        conditionId: 'dota-market',
        slug: 'liquid-vs-falcons',
        question: 'Dota 2: Team Liquid vs Team Falcons (BO3) - Riyadh Masters',
        outcomes: ['Team Liquid', 'Team Falcons'],
        tags: ['dota2', 'polymarket'],
      },
      {
        ...SAMPLE_MARKET,
        conditionId: 'valorant-market',
        slug: 'sentinels-vs-g2',
        question: 'Valorant: Sentinels vs G2 Esports (BO3) - VCT Americas',
        outcomes: ['Sentinels', 'G2 Esports'],
        tags: ['valorant', 'polymarket'],
      },
    ];

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: markets, total: markets.length }),
      }),
    );
    await page.goto('/#/');
    await expect(page.getByRole('button', { name: /^cs2$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'LOL' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Dota 2$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Valorant' })).toHaveCount(0);
    await expect(page.locator('main')).toContainText('LCK Summer');
    await expect(page.locator('main')).toContainText('Riyadh Masters');
    await expect(page.locator('main')).toContainText('VCT Americas');
    const gameTags = page.getByTestId('game-tag');
    await expect(gameTags).toHaveCount(4);
    const gameTagStylesByTheme: Record<string, Array<{
      game: string | null;
      color: string;
      backgroundColor: string;
      borderColor: string;
      borderWidth: string;
      height: string;
    }>> = {};
    for (const theme of ['dark', 'light', 'matrix'] as const) {
      await setTheme(page, theme);
      gameTagStylesByTheme[theme] = await gameTags.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            game: element.getAttribute('data-game'),
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
            height: style.height,
          };
        }),
      );
    }
    const gameTagStyles = gameTagStylesByTheme.dark;
    expect(gameTagStyles.map((item) => item.game).sort()).toEqual([
      'cs2',
      'dota2',
      'lol',
      'valorant',
    ]);
    expect(new Set(gameTagStyles.map((item) => item.backgroundColor)).size).toBe(4);
    expect(gameTagStyles.every((item) => item.height === '20px')).toBe(true);
    expect(gameTagStyles.every((item) => item.backgroundColor !== 'rgba(0, 0, 0, 0)')).toBe(true);
    expect(gameTagStyles.every((item) => item.borderWidth === '0px')).toBe(true);
    expect(Object.fromEntries(gameTagStyles.map((item) => [item.game, item.backgroundColor]))).toEqual({
      cs2: 'rgb(222, 155, 53)',
      dota2: 'rgb(194, 60, 42)',
      lol: 'rgb(200, 155, 60)',
      valorant: 'rgb(255, 70, 85)',
    });
    for (const theme of ['light', 'matrix']) {
      const themeStyles = gameTagStylesByTheme[theme];
      expect(new Set(themeStyles.map((item) => item.backgroundColor)).size).toBe(4);
      expect(themeStyles.every((item) => item.backgroundColor !== 'rgba(0, 0, 0, 0)')).toBe(true);
      expect(themeStyles.every((item) => item.borderWidth === '0px')).toBe(true);
    }
    expect(gameTagStylesByTheme.light.map((item) => item.backgroundColor)).toEqual(
      gameTagStylesByTheme.dark.map((item) => item.backgroundColor),
    );
    await expect(
      page.getByTestId('market-liquidity').filter({ hasText: /12\.3K|12,345/ }).first(),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText('流动性');
    await expect(page.getByTestId('ai-analyzed-badge')).toHaveCount(0);
    await expect(page.getByTestId('ai-analyzed-badge-mobile')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('已分析');
    await expect
      .poll(async () =>
        page.getByTestId('lobby-market-grid').first().evaluate((element) =>
          getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(2);
    await expect(page.locator('body')).not.toContainText('HLTV');
    await expect(page.locator('body')).not.toContainText(/T1\s+-/);
    await expect(page.locator('body')).not.toContainText(/Team Liquid\s+-/);
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
    await page.route('**/api/esports/fetch-upcoming', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh unavailable' }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('odds-quote').filter({ hasText: '1.54' }).first()).toBeVisible();

    await page.getByRole('button', { name: /刷新|Refresh/, exact: true }).click();

    await expect(
      page.getByText(/已保留并显示本地赛事数据|Local event data remains visible/),
    ).toHaveCount(0);
    await expect(page.getByTestId('odds-quote').filter({ hasText: '1.54' }).first()).toBeVisible();
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

  test('hides map winner markets from lobby cards', async ({ page }) => {
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
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
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
    const mapHandicap = {
      ...series,
      conditionId: `${series.conditionId}-map-2-handicap`,
      slug: `${series.conditionId}-map-2-handicap`,
      question: 'Map 2 Rounds Handicap: Natus Vincere (-2.5) vs FaZe Clan (+2.5)',
      outcomes: ['Natus Vincere (-2.5)', 'FaZe Clan (+2.5)'],
      outcomePrices: ['0.45', '0.55'],
      liquidity: 20_000,
    };

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [series, ...mapMarkets, mapHandicap], total: 5 }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('match-odds-row')).toHaveCount(1);
    await expect(page.getByText('+3')).toHaveCount(0);
    await expect(page.getByText(/地图 1|Map 1/)).toHaveCount(0);
    await expect(page.getByText(/地图 2|Map 2/)).toHaveCount(0);
    await expect(page.getByText(/地图 3|Map 3/)).toHaveCount(0);
    await expect(page.getByText(/让分|Handicap/)).toHaveCount(0);
    await expect(page.getByText('2.22')).toHaveCount(0);
    await expect(page.getByText(/比赛胜负|Match Winner/)).toBeVisible();
    await expect(page.getByTestId('odds-quote')).toHaveCount(2);
    await expect(page.getByTestId('odds-quote').filter({ hasText: '1.79' }).first()).toBeVisible();
    await expect(page.getByTestId('desktop-bet-slip')).toHaveCount(0);
  });

  test('shows only one match winner, handicap, and totals column', async ({
    page,
  }) => {
    const matchWinner = {
      ...SAMPLE_MARKET,
      conditionId: 'dota-match-winner',
      slug: 'puckchamp-vs-jenz',
      question: 'Dota 2: PuckChamp vs Team Jenz (BO3) - FISSURE Universe',
      outcomes: ['PuckChamp', 'Team Jenz'],
      outcomePrices: ['0.58', '0.42'],
      tags: ['dota2', 'polymarket'],
      liquidity: 2_500,
    };
    const handicap = {
      ...matchWinner,
      conditionId: 'dota-handicap',
      slug: 'puckchamp-vs-jenz-handicap',
      question: 'Dota 2: Game Handicap: PuckChamp (-1.5) vs Team Jenz (+1.5) - FISSURE Universe',
      outcomes: ['PuckChamp (-1.5)', 'Team Jenz (+1.5)'],
      outcomePrices: ['0.4', '0.6'],
    };
    const totals = {
      ...matchWinner,
      conditionId: 'dota-total',
      slug: 'puckchamp-vs-jenz-total',
      question: 'Dota 2: Total Games 2.5: PuckChamp vs Team Jenz - FISSURE Universe',
      outcomes: ['Over 2.5', 'Under 2.5'],
      outcomePrices: ['0.47', '0.53'],
      liquidity: 4_000,
    };

    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [matchWinner, handicap, totals], total: 3 }),
      }),
    );

    await page.goto('/#/');
    await expect(page.getByTestId('match-odds-row')).toHaveCount(1);
    await expect(page.locator('main')).toContainText('FISSURE Universe');
    await expect(page.getByText(/比赛胜负|Match Winner/)).toBeVisible();
    await expect(page.getByText(/让分|Handicap/)).toBeVisible();
    await expect(page.getByText(/大小分|Totals/)).toBeVisible();
    await expect(page.getByText(/O 2.5|Over 2.5/)).toBeVisible();
    await expect(page.getByText('PuckChamp').first()).toBeVisible();
    await expect(page.getByText('Game Handicap')).toHaveCount(0);
    await expect(page.getByText('Unknown Event')).toHaveCount(0);
    await expect(page.getByTestId('odds-quote')).toHaveCount(6);
  });

  test('shows a minimal empty state when filters hide all matches', async ({ page }) => {
    await page.route(/\/api\/markets(?:\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
      }),
    );

    await page.goto('/#/');
    await page.getByRole('button', { name: /今日|Today/ }).click();
    await expect(page.getByText(/没有比赛|No matches/)).toBeVisible();
    await expect(page.getByText(/没有匹配当前筛选|No event markets match/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /清除筛选|Clear filters/ })).toHaveCount(0);
  });
});
