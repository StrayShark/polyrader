import { expect, test } from '@playwright/test';

const games = ['cs2', 'lol', 'dota2', 'valorant'] as const;
const expectedStages = [
  'source',
  'facts',
  'market',
  'prompt',
  'response',
  'report',
  'decision',
  'settlement',
  'statistics',
];

test('Sprint F proves all nine deterministic release stages for four boards', async ({
  request,
}) => {
  for (const game of games) {
    const runResponse = await request.post('/api/analysis/runs/fixture', {
      data: {
        game,
        provider: 'fixture-sprint-f',
        model: `${game}-sprint-f`,
      },
    });
    expect(runResponse.status()).toBe(201);
    const run = (await runResponse.json()) as {
      data: {
        run: { runId: string; validationStatus: string };
        linkedBet: { id: string } | null;
      };
    };
    expect(run.data.run.validationStatus).toBe('valid');
    expect(run.data.linkedBet, `${game} fixture should create a paper bet`).not.toBeNull();
    const linkedBet = run.data.linkedBet!;

    const closingResponse = await request.post(`/api/sim/bets/${linkedBet.id}/closing-price`, {
      data: { closingOdds: 1.7, source: 'fixture-sprint-f-close' },
    });
    expect(closingResponse.ok()).toBe(true);
    const settleResponse = await request.patch(`/api/sim/bets/${linkedBet.id}/settle`, {
      data: { result: 'won' },
    });
    expect(settleResponse.ok()).toBe(true);
  }

  const response = await request.get('/api/validation-lab/release-gates');
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    data: Array<{
      game: string;
      status: string;
      fixture: {
        status: string;
        stages: Array<{ stage: string; status: string }>;
        blockers: string[];
      };
      currentSource: { status: string; blockers: string[] };
    }>;
  };
  expect(payload.data).toHaveLength(4);
  for (const game of games) {
    const gate = payload.data.find((item) => item.game === game);
    expect(gate).toBeTruthy();
    expect(gate!.fixture.status).toBe('passed');
    expect(gate!.fixture.blockers).toEqual([]);
    expect(gate!.fixture.stages.map((stage) => stage.stage)).toEqual(expectedStages);
    expect(gate!.fixture.stages.every((stage) => stage.status === 'passed')).toBe(true);
    expect(['fixture_ready', 'verified']).toContain(gate!.status);
  }
});

test('Sprint F keeps an invalid provider response out of the paper and release chain', async ({
  request,
}) => {
  const response = await request.post('/api/analysis/runs/fixture', {
    data: { game: 'cs2', provider: 'fixture-invalid-sprint-f', invalid: true },
  });
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as {
    data: {
      run: { validationStatus: string };
      report: unknown;
      decision: unknown;
      linkedBet: unknown;
    };
  };
  expect(payload.data.run.validationStatus).toBe('invalid');
  expect(payload.data.report).toBeNull();
  expect(payload.data.decision).toBeNull();
  expect(payload.data.linkedBet).toBeNull();
});
