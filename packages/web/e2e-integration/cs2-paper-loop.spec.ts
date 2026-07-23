import { expect, test } from '@playwright/test';

test('CS2 fixture API closes the report, paper bet and performance loop', async ({ request }) => {
  const runResponse = await request.post('/api/analysis/runs/fixture', {
    data: { game: 'cs2', provider: 'fixture-e2e', model: 'cs2-e2e-v1' },
  });
  expect(runResponse.status()).toBe(201);
  const runBody = (await runResponse.json()) as {
    data: {
      run: { runId: string; validationStatus: string };
      decision: { action: string };
      report: { contractVersion: string };
      linkedBet: { id: string; game: string; status: string };
    };
  };
  expect(runBody.data.run.validationStatus).toBe('valid');
  expect(runBody.data.report.contractVersion).toBe('analysis.v1');
  expect(runBody.data.decision.action).toBe('paper_bet');
  expect(runBody.data.linkedBet).toMatchObject({ game: 'cs2', status: 'open' });

  const detailResponse = await request.get(`/api/analysis/runs/${runBody.data.run.runId}`);
  expect(detailResponse.ok()).toBe(true);

  const settleResponse = await request.patch(`/api/sim/bets/${runBody.data.linkedBet.id}/settle`, {
    data: { result: 'won' },
  });
  expect(settleResponse.ok()).toBe(true);

  const performanceResponse = await request.get('/api/performance/summary');
  expect(performanceResponse.ok()).toBe(true);
  const performance = (await performanceResponse.json()) as {
    data: { settledCount: number; wins: number; byGame: Array<{ key: string }> };
  };
  expect(performance.data.settledCount).toBeGreaterThanOrEqual(1);
  expect(performance.data.wins).toBeGreaterThanOrEqual(1);
  expect(performance.data.byGame.some((row) => row.key === 'cs2')).toBe(true);
});
