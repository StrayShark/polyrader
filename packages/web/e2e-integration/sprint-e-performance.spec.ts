import { expect, test } from '@playwright/test';

test('Sprint E filters one canonical metric scope and exposes closing observability', async ({
  request,
}) => {
  const nonce = Date.now();
  const provider = `sprint-e-${nonce}`;

  const place = async (suffix: string, probability: number) => {
    const response = await request.post('/api/sim/bets', {
      data: {
        betType: 'single',
        stake: 2,
        matchId: `sprint-e-match-${nonce}-${suffix}`,
        marketId: `sprint-e-market-${nonce}-${suffix}`,
        provider,
        game: 'cs2',
        marketKind: 'match_winner',
        modelProbability: probability,
        marketProbability: 0.5,
        legs: [
          {
            matchId: `sprint-e-match-${nonce}-${suffix}`,
            marketId: `sprint-e-market-${nonce}-${suffix}`,
            selection: 'Team A',
            odds: 2,
            source: provider,
          },
        ],
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { data: { bet: { id: string } } };
  };

  const winner = await place('winner', 0.65);
  const loser = await place('loser', 0.35);

  const closeResponse = await request.post(`/api/sim/bets/${winner.data.bet.id}/closing-price`, {
    data: { closingOdds: 1.8, source: 'sprint-e-close' },
  });
  expect(closeResponse.ok()).toBe(true);

  await request.patch(`/api/sim/bets/${winner.data.bet.id}/settle`, {
    data: { result: 'won', settlementSource: 'hltv' },
  });
  await request.patch(`/api/sim/bets/${loser.data.bet.id}/settle`, {
    data: { result: 'lost', settlementSource: 'hltv' },
  });

  const filteredResponse = await request.get(
    `/api/performance/summary?game=cs2&provider=${provider}&marketKind=match_winner`,
  );
  expect(filteredResponse.ok()).toBe(true);
  const filtered = (await filteredResponse.json()) as {
    data: {
      settledCount: number;
      avgLogLoss?: number;
      returnVolatility?: number;
      sharpeRatio?: number;
      filters: { game?: string; provider?: string; marketKind?: string };
      filterOptions: { providers: string[] };
      closingCoverage: {
        capturedCount: number;
        unavailableCount: number;
        coverageRate: number;
        averageAttempts: number;
        unavailableReasons: Array<{ reason: string; count: number }>;
      };
      byProvider: Array<{
        key: string;
        settledCount: number;
        clvCoverageRate: number;
        items: Array<{ betId: string; pnl: number }>;
      }>;
      byEventTier: Array<{ key: string; settledCount: number }>;
      byDataQuality: Array<{ key: string; settledCount: number }>;
      byConfidenceBand: Array<{ key: string; settledCount: number }>;
      byEdgeBand: Array<{ key: string; settledCount: number }>;
    };
  };

  expect(filtered.data.settledCount).toBe(2);
  expect(typeof filtered.data.avgLogLoss).toBe('number');
  expect(typeof filtered.data.returnVolatility).toBe('number');
  expect(typeof filtered.data.sharpeRatio).toBe('number');
  expect(filtered.data.filters).toMatchObject({
    game: 'cs2',
    provider,
    marketKind: 'match_winner',
  });
  expect(filtered.data.filterOptions.providers).toContain(provider);
  expect(filtered.data.closingCoverage.capturedCount).toBe(1);
  expect(filtered.data.closingCoverage.unavailableCount).toBe(1);
  expect(filtered.data.closingCoverage.coverageRate).toBe(0.5);
  expect(filtered.data.closingCoverage.averageAttempts).toBe(1);
  expect(filtered.data.closingCoverage.unavailableReasons).toContainEqual({
    reason: 'NO_RELIABLE_CLOSING_PRICE',
    count: 1,
  });
  expect(filtered.data.byProvider).toContainEqual(
    expect.objectContaining({ key: provider, settledCount: 2, clvCoverageRate: 0.5 }),
  );
  expect(filtered.data.byProvider[0]?.items).toHaveLength(2);
  expect(filtered.data.byEventTier).toContainEqual(
    expect.objectContaining({ key: 'unknown', settledCount: 2 }),
  );
  expect(filtered.data.byDataQuality).toContainEqual(
    expect.objectContaining({ key: 'unknown', settledCount: 2 }),
  );
  expect(filtered.data.byConfidenceBand).toContainEqual(
    expect.objectContaining({ key: 'unknown', settledCount: 2 }),
  );
  expect(filtered.data.byEdgeBand.reduce((sum, row) => sum + row.settledCount, 0)).toBe(2);

  const today = new Date().toISOString().slice(0, 10);
  const datedResponse = await request.get(
    `/api/performance/summary?provider=${provider}&from=${today}&to=${today}`,
  );
  expect(datedResponse.ok()).toBe(true);
  expect(
    ((await datedResponse.json()) as { data: { settledCount: number } }).data.settledCount,
  ).toBe(2);

  const invalidRange = await request.get('/api/performance/summary?from=2026-07-23&to=2026-07-22');
  expect(invalidRange.status()).toBe(400);
});
