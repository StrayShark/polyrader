import { expect, test } from '@playwright/test';

test('Sprint H exposes persisted history, lifecycle, and sanitized diagnostics', async ({
  request,
}) => {
  const [historyResponse, lifecycleResponse, diagnosticsResponse] = await Promise.all([
    request.get('/api/validation-lab/release-audits?game=cs2&limit=10'),
    request.get('/api/validation-lab/lifecycle/cs2'),
    request.get('/api/validation-lab/diagnostics/export?limit=10'),
  ]);

  expect(historyResponse.ok()).toBe(true);
  expect(lifecycleResponse.ok()).toBe(true);
  expect(diagnosticsResponse.ok()).toBe(true);

  const history = (await historyResponse.json()) as { data: unknown[] };
  const lifecycle = (await lifecycleResponse.json()) as {
    data: { closing: string; settlement: string; statistics: string; nextAction: string };
  };
  const diagnostics = (await diagnosticsResponse.json()) as {
    data: {
      contractVersion: string;
      database: { migrationCount: number; latestMigration: string };
      redaction: { omitted: string[] };
    };
  };
  const serialized = JSON.stringify(diagnostics.data);

  expect(Array.isArray(history.data)).toBe(true);
  expect(lifecycle.data).toMatchObject({
    closing: 'not_applicable',
    settlement: 'not_applicable',
    statistics: 'not_applicable',
  });
  expect(lifecycle.data.nextAction.length).toBeGreaterThan(0);
  expect(diagnostics.data.contractVersion).toBe('release-diagnostics.v1');
  expect(diagnostics.data.database.migrationCount).toBe(43);
  expect(diagnostics.data.database.latestMigration).toBe('043_sim_bet_settlement_source.sql');
  expect(serialized).not.toMatch(/api[_-]?key|private[_-]?key|authorization|bearer\s/i);
  expect(serialized).not.toContain(process.env.HOME ?? '/Users');
});
