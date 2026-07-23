import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to run GRID Riot-game source checks');
test.setTimeout(180_000);

for (const game of ['lol', 'valorant'] as const) {
  test(`${game} GRID schedule responds or reports an explicit configuration blocker`, async ({
    request,
  }) => {
    const syncResponse = await request.post(`/api/esports/sources/${game}/sync`);
    expect(syncResponse.ok()).toBe(true);
    const sync = (await syncResponse.json()) as {
      data: {
        sources: Array<{ source: string; status: string; records: number; message?: string }>;
      };
    };
    const grid = sync.data.sources.find((source) => source.source === 'grid');
    expect(grid).toBeTruthy();

    if (grid?.status === 'skipped') {
      expect(grid.message).toMatch(/key|title ID|configured/i);
      return;
    }

    expect(grid, grid?.message).toMatchObject({ status: 'success' });
    if (grid!.records === 0) {
      expect(grid?.message).toMatch(/no upcoming GRID/i);
      return;
    }
    const matchesResponse = await request.get(
      `/api/esports/sources/${game}/snapshots?entityType=match&limit=10`,
    );
    expect(matchesResponse.ok()).toBe(true);
    const matches = (await matchesResponse.json()) as {
      data: Array<{ source: string; startsAt?: string; status: string }>;
    };
    const gridMatches = matches.data.filter((match) => match.source === 'grid');
    expect(gridMatches.length).toBeGreaterThan(0);
    expect(gridMatches[0]?.status).toBe('scheduled');
    expect(Date.parse(gridMatches[0]?.startsAt ?? '')).toBeGreaterThan(Date.now());

    const normalizeResponse = await request.post(`/api/validation-lab/boards/${game}/normalize`);
    expect(normalizeResponse.ok()).toBe(true);
    const normalized = (await normalizeResponse.json()) as {
      data: { persisted: Array<{ adapterVersion: string; startsAt: string }> };
    };
    expect(normalized.data.persisted.length).toBeGreaterThan(0);
    expect(normalized.data.persisted[0]?.adapterVersion).toBe(`${game}.facts.v2`);
    expect(Date.parse(normalized.data.persisted[0]!.startsAt)).toBeGreaterThan(Date.now());
  });
}
