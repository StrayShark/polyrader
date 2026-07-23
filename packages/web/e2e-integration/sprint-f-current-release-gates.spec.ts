import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';
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

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to audit current-source release gates');
test.setTimeout(180_000);

for (const game of games) {
  test(`${game} current source returns an explicit nine-stage release decision`, async ({
    request,
  }, testInfo) => {
    const syncResponse = await request.post(`/api/esports/sources/${game}/sync`);
    expect(syncResponse.ok()).toBe(true);

    const normalizeResponse = await request.post(`/api/validation-lab/boards/${game}/normalize`);
    expect(normalizeResponse.ok()).toBe(true);

    const response = await request.get(`/api/validation-lab/release-gates/${game}`);
    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as {
      data: {
        status: 'verified' | 'fixture_ready' | 'blocked';
        currentSource: {
          status: 'passed' | 'blocked' | 'missing';
          stages: Array<{
            stage: string;
            status: 'passed' | 'blocked' | 'missing';
            detail: string;
          }>;
          blockers: string[];
        };
      };
    };

    await testInfo.attach(`${game}-current-release-gate`, {
      body: Buffer.from(JSON.stringify(payload.data, null, 2)),
      contentType: 'application/json',
    });

    expect(payload.data.currentSource.stages.map((stage) => stage.stage)).toEqual(expectedStages);
    if (payload.data.currentSource.status === 'passed') {
      expect(payload.data.status).toBe('verified');
      expect(payload.data.currentSource.stages.every((stage) => stage.status === 'passed')).toBe(
        true,
      );
    } else {
      expect(payload.data.currentSource.blockers.length).toBeGreaterThan(0);
      expect(payload.data.currentSource.stages.some((stage) => stage.status !== 'passed')).toBe(
        true,
      );
    }
  });
}
