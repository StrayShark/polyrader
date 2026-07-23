import { expect, test } from '@playwright/test';

test('Dota 2 fixture API closes normalized facts, paper bet and performance loop', async ({
  request,
}) => {
  const normalizeResponse = await request.post('/api/validation-lab/boards/dota2/normalize', {
    data: { fixture: true },
  });
  expect(normalizeResponse.status()).toBe(201);
  const normalized = (await normalizeResponse.json()) as {
    data: {
      summary: {
        boardState: string;
        completeness: number;
        missing: string[];
        sampleMatch: { adapterVersion: string; players: unknown[]; patchVersion: string };
        analysisEligibility: {
          analysisEligible: boolean;
          paperOrderEligible: boolean;
          mode: string;
          selectedMarket: { evidenceType: string; liquidityStatus: string };
        };
        stages: Array<{ stage: string; status: string }>;
      };
    };
  };
  expect(normalized.data.summary).toMatchObject({
    boardState: 'paper_ready',
    completeness: 1,
    missing: [],
  });
  expect(normalized.data.summary.sampleMatch).toMatchObject({
    adapterVersion: 'dota2.facts.v3',
    patchVersion: '7.41',
  });
  expect(normalized.data.summary.sampleMatch.players).toHaveLength(10);
  expect(normalized.data.summary.analysisEligibility).toMatchObject({
    analysisEligible: true,
    paperOrderEligible: true,
    mode: 'synthetic_practice',
    selectedMarket: {
      evidenceType: 'synthetic',
      liquidityStatus: 'synthetic',
    },
  });
  expect(
    normalized.data.summary.stages.find((stage) => stage.stage === 'market_align')?.status,
  ).toBe('warning');

  const runResponse = await request.post('/api/analysis/runs/fixture', {
    data: { game: 'dota2', provider: 'fixture-e2e', model: 'dota2-e2e-v1' },
  });
  expect(runResponse.status()).toBe(201);
  const runBody = (await runResponse.json()) as {
    data: {
      run: {
        validationStatus: string;
        gameAdapterVersion: string;
        marketAdapterVersion: string;
      };
      envelope: {
        contractVersion: string;
        game: string;
        promptVersion: string;
        market: { evidenceType: string; liquidityStatus: string };
      };
      report: {
        contractVersion: string;
        marketContext: { evidenceType: string; liquidityStatus: string };
      };
      decision: { action: string; reasonCodes: string[] };
      linkedBet: { id: string; game: string; status: string };
    };
  };
  expect(runBody.data.envelope).toMatchObject({
    contractVersion: 'analysis.v1',
    game: 'dota2',
    promptVersion: 'dota2.match-winner.v1.0.0',
    market: { evidenceType: 'synthetic', liquidityStatus: 'synthetic' },
  });
  expect(runBody.data.run.validationStatus).toBe('valid');
  expect(runBody.data.run.gameAdapterVersion).toBe('dota2.fixture.v1');
  expect(runBody.data.run.marketAdapterVersion).toBe('market.v1');
  expect(runBody.data.report).toMatchObject({
    contractVersion: 'analysis.v1',
    marketContext: { evidenceType: 'synthetic', liquidityStatus: 'synthetic' },
  });
  expect(runBody.data.decision.action).toBe('paper_bet');
  expect(runBody.data.decision.reasonCodes).toContain('SYNTHETIC_PRACTICE');
  expect(runBody.data.linkedBet).toMatchObject({ game: 'dota2', status: 'open' });

  const closingResponse = await request.post(
    `/api/sim/bets/${runBody.data.linkedBet.id}/closing-price`,
    {
      data: { closingOdds: 1.8, source: 'dota-d5-e2e-close' },
    },
  );
  expect(closingResponse.ok()).toBe(true);
  const closing = (await closingResponse.json()) as {
    data: { clvStatus: string; closingOdds: number };
  };
  expect(closing.data.clvStatus).toBe('captured');
  expect(closing.data.closingOdds).toBeCloseTo(1.8, 5);

  const settleResponse = await request.patch(`/api/sim/bets/${runBody.data.linkedBet.id}/settle`, {
    data: { result: 'won' },
  });
  expect(settleResponse.ok()).toBe(true);

  const performanceResponse = await request.get('/api/performance/summary');
  expect(performanceResponse.ok()).toBe(true);
  const performance = (await performanceResponse.json()) as {
    data: {
      settledCount: number;
      wins: number;
      winRate: number;
      avgBrier: number | null;
      totalPnl: number;
      roi: number;
      avgClv?: number;
      clvSampleCount: number;
      equityCurve: unknown[];
      byGame: Array<{ key: string }>;
    };
  };
  expect(performance.data.settledCount).toBeGreaterThanOrEqual(1);
  expect(performance.data.wins).toBeGreaterThanOrEqual(1);
  expect(performance.data.winRate).toBeGreaterThan(0);
  expect(performance.data.avgBrier).toEqual(expect.any(Number));
  expect(performance.data.totalPnl).toBeGreaterThan(0);
  expect(performance.data.roi).toBeGreaterThan(0);
  expect(performance.data.clvSampleCount).toBeGreaterThanOrEqual(1);
  expect(typeof performance.data.avgClv).toBe('number');
  expect(performance.data.equityCurve.length).toBeGreaterThanOrEqual(1);
  expect(performance.data.byGame.some((row) => row.key === 'dota2')).toBe(true);
});
