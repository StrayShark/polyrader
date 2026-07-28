import { expect, test } from '@playwright/test';

test('Sprint D exposes risk usage and closes an auditable CLV loop', async ({ request }) => {
  const riskResponse = await request.get('/api/paper-policy/risk-state');
  expect(riskResponse.ok()).toBe(true);
  const risk = (await riskResponse.json()) as {
    data: {
      policyVersion: string;
      exposure: { dailyStake: number; openExposure: number };
      limits: {
        maxDailyStake: number;
        maxOpenExposure: number;
        maxGameExposure: number;
        maxProviderExposure: number;
        maxMarketKindExposure: number;
      };
    };
  };
  expect(risk.data.policyVersion).toBe('paper.v1.2.0');
  expect(risk.data.limits.maxDailyStake).toBeGreaterThan(0);
  expect(risk.data.limits.maxOpenExposure).toBeGreaterThan(0);
  expect(risk.data.limits.maxGameExposure).toBeGreaterThan(0);
  expect(risk.data.limits.maxProviderExposure).toBeGreaterThan(0);
  expect(risk.data.limits.maxMarketKindExposure).toBeGreaterThan(0);

  const nonce = `${Date.now()}`;
  const provider = `sprint-d-e2e-${nonce}`;
  const matchId = `sprint-d-match-${nonce}`;
  const marketId = `sprint-d-market-${nonce}`;
  const summaryPath = `/api/performance/summary?game=cs2&provider=${provider}&marketKind=match_winner`;

  const beforeResponse = await request.get(summaryPath);
  expect(beforeResponse.ok()).toBe(true);
  const before = (await beforeResponse.json()) as {
    data: { settledCount: number; clvSampleCount: number };
  };

  const placeResponse = await request.post('/api/sim/bets', {
    data: {
      betType: 'single',
      stake: 5,
      matchId,
      marketId,
      provider,
      game: 'cs2',
      marketKind: 'match_winner',
      modelProbability: 0.6,
      marketProbability: 0.5,
      legs: [
        {
          matchId,
          marketId,
          selection: 'Team A',
          odds: 2,
          source: provider,
        },
      ],
    },
  });
  expect(placeResponse.status()).toBe(201);
  const placed = (await placeResponse.json()) as { data: { bet: { id: string } } };

  const closingResponse = await request.post(`/api/sim/bets/${placed.data.bet.id}/closing-price`, {
    data: { closingOdds: 1.8, source: 'e2e-close' },
  });
  expect(closingResponse.ok()).toBe(true);
  const closing = (await closingResponse.json()) as {
    data: { clvStatus: string; closingOdds: number; clv: number };
  };
  expect(closing.data.clvStatus).toBe('captured');
  expect(closing.data.closingOdds).toBeCloseTo(1.8, 5);
  expect(closing.data.clv).toBeCloseTo(0.1111, 3);

  const settleResponse = await request.patch(`/api/sim/bets/${placed.data.bet.id}/settle`, {
    data: { result: 'won', settlementSource: 'hltv' },
  });
  expect(settleResponse.ok()).toBe(true);

  const afterResponse = await request.get(summaryPath);
  expect(afterResponse.ok()).toBe(true);
  const after = (await afterResponse.json()) as {
    data: { settledCount: number; clvSampleCount: number; avgClv?: number };
  };
  expect(after.data.settledCount).toBe(before.data.settledCount + 1);
  expect(after.data.clvSampleCount).toBe(before.data.clvSampleCount + 1);
  expect(typeof after.data.avgClv).toBe('number');
});
