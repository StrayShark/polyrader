import { expect, test } from '@playwright/test';

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

test('Phase 5 verification completes all four verified release gates', async ({ request }) => {
  const verifyResponse = await request.post('/api/validation-lab/p5/verify', {
    data: { nonce: `p5-e2e-${Date.now()}` },
  });
  expect(verifyResponse.status()).toBe(201);
  const verify = (await verifyResponse.json()) as {
    data: {
      releaseReady: boolean;
      verifiedCount: number;
      boards: Array<{
        game: string;
        status: string;
        fixture: { status: string; stages: Array<{ stage: string; status: string }> };
        currentSource: { status: string; stages: Array<{ stage: string; status: string }> };
      }>;
    };
  };
  expect(verify.data.releaseReady).toBe(true);
  expect(verify.data.verifiedCount).toBe(4);
  expect(verify.data.boards).toHaveLength(4);

  const gatesResponse = await request.get('/api/validation-lab/release-gates');
  expect(gatesResponse.ok()).toBe(true);
  const gates = (await gatesResponse.json()) as { data: typeof verify.data.boards };
  for (const board of gates.data) {
    expect(board.status).toBe('verified');
    expect(board.fixture.status).toBe('passed');
    expect(board.currentSource.status).toBe('passed');
    expect(board.fixture.stages.map((stage) => stage.stage)).toEqual(expectedStages);
    expect(board.currentSource.stages.map((stage) => stage.stage)).toEqual(expectedStages);
    expect(board.fixture.stages.every((stage) => stage.status === 'passed')).toBe(true);
    expect(board.currentSource.stages.every((stage) => stage.status === 'passed')).toBe(true);
  }
});
