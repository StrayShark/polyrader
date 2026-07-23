import { expect, test } from '@playwright/test';

test('Sprint G emits sanitized machine-readable release and database diagnostics', async ({
  request,
}, testInfo) => {
  const [releaseResponse, backupResponse] = await Promise.all([
    request.get('/api/validation-lab/release-report'),
    request.get('/api/backup/info'),
  ]);
  expect(releaseResponse.ok()).toBe(true);
  expect(backupResponse.ok()).toBe(true);

  const release = (await releaseResponse.json()) as {
    data: { releaseReady: boolean; boards: unknown[]; blockedCount: number };
  };
  const backup = (await backupResponse.json()) as {
    data: {
      dbPath: string;
      schema: { migrationCount: number; latestMigration: string | null };
    };
  };
  const diagnostic = {
    generatedAt: new Date().toISOString(),
    release: release.data,
    database: {
      filename: backup.data.dbPath,
      schema: backup.data.schema,
    },
  };
  const serialized = JSON.stringify(diagnostic, null, 2);

  expect(release.data.boards).toHaveLength(4);
  expect(typeof release.data.releaseReady).toBe('boolean');
  expect(backup.data.dbPath).not.toContain('/');
  expect(backup.data.schema.migrationCount).toBeGreaterThanOrEqual(39);
  expect(serialized).not.toMatch(/api[_-]?key|private[_-]?key|authorization|bearer\s/i);

  await testInfo.attach('sprint-g-release-gates.json', {
    body: Buffer.from(serialized),
    contentType: 'application/json',
  });
});
