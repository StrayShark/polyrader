import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to run current OpenDota smoke checks');
test.setTimeout(120_000);

test('OpenDota current source sync persists matches, patch and detailed players', async ({
  request,
}) => {
  const syncResponse = await request.post('/api/esports/sources/dota2/sync');
  expect(syncResponse.ok()).toBe(true);
  const sync = (await syncResponse.json()) as {
    data: {
      records: number;
      sources: Array<{ source: string; status: string; records: number; message?: string }>;
    };
  };
  const openDota = sync.data.sources.find((source) => source.source === 'opendota');
  expect(openDota, openDota?.message).toMatchObject({ status: 'success' });
  expect(openDota!.records).toBeGreaterThan(50);

  const [matchesResponse, patchesResponse, playersResponse] = await Promise.all([
    request.get('/api/esports/sources/dota2/snapshots?entityType=match&limit=5'),
    request.get('/api/esports/sources/dota2/snapshots?entityType=patch&limit=5'),
    request.get('/api/esports/sources/dota2/snapshots?entityType=player&limit=50'),
  ]);
  expect(matchesResponse.ok()).toBe(true);
  expect(patchesResponse.ok()).toBe(true);
  expect(playersResponse.ok()).toBe(true);
  const matches = (await matchesResponse.json()) as { data: unknown[] };
  const patches = (await patchesResponse.json()) as { data: unknown[] };
  const players = (await playersResponse.json()) as { data: unknown[] };
  expect(matches.data.length).toBeGreaterThan(0);
  expect(patches.data.length).toBeGreaterThan(0);
  expect(players.data.length).toBeGreaterThanOrEqual(10);

  const normalizeResponse = await request.post('/api/validation-lab/boards/dota2/normalize');
  expect(normalizeResponse.ok()).toBe(true);
  const normalized = (await normalizeResponse.json()) as {
    data: { persisted: Array<{ adapterVersion: string; patchVersion?: string }> };
  };
  expect(normalized.data.persisted.length).toBeGreaterThan(0);
  expect(normalized.data.persisted[0]?.adapterVersion).toBe('dota2.facts.v2');
  expect(normalized.data.persisted[0]?.patchVersion).toBeTruthy();
});
