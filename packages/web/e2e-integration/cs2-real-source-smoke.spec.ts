import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to run current HLTV smoke checks');
test.setTimeout(120_000);

test('current HLTV schedule refreshes normalized CS2 facts inside the active policy window', async ({
  request,
}) => {
  const refreshResponse = await request.post('/api/esports/fetch-upcoming');
  expect(refreshResponse.ok()).toBe(true);
  const refresh = (await refreshResponse.json()) as {
    data: {
      hltvMatches: Array<{ matchId: string; teamAName: string; teamBName: string; date: string }>;
      enrichmentQueued: boolean;
    };
  };
  expect(refresh.data.hltvMatches.length).toBeGreaterThan(0);
  expect(refresh.data.hltvMatches[0]?.teamAName).toBeTruthy();
  expect(refresh.data.hltvMatches[0]?.teamBName).toBeTruthy();
  expect(Date.parse(refresh.data.hltvMatches[0]!.date)).toEqual(expect.any(Number));

  const sourceResponse = await request.post('/api/esports/sources/cs2/sync');
  expect(sourceResponse.ok()).toBe(true);
  const source = (await sourceResponse.json()) as { data: { records: number } };
  expect(source.data.records).toBeGreaterThan(0);

  const normalizeResponse = await request.post('/api/validation-lab/boards/cs2/normalize');
  expect(normalizeResponse.ok()).toBe(true);
  const normalized = (await normalizeResponse.json()) as {
    data: {
      persisted: Array<{
        adapterVersion: string;
        freshnessSeconds: number;
        dataSnapshotHash: string;
      }>;
    };
  };
  expect(normalized.data.persisted.length).toBeGreaterThan(0);
  expect(normalized.data.persisted[0]?.adapterVersion).toBe('cs2.facts.v2');
  expect(normalized.data.persisted[0]?.freshnessSeconds).toBeLessThanOrEqual(3_600);
  expect(normalized.data.persisted[0]?.dataSnapshotHash).toMatch(/^sha256:/);
});
