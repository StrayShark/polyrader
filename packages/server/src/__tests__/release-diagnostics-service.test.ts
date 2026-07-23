import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReleaseAuditHistoryEntry, ReleaseGateReport } from '@polyrader/core';
import { closeDb, ReleaseAuditRepository, runMigrations } from '@polyrader/infra';
import { classifyProviderFailure, sanitizeDiagnosticText } from '../services/diagnostic-redaction';
import { ReleaseDiagnosticsService } from '../services/release-diagnostics-service';

const testDbPath = path.join(process.cwd(), 'data', 'release-diagnostics-test.db');

describe('Sprint H release diagnostics', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('persists audit metadata and exports a sanitized migration-aware bundle', () => {
    const history = new ReleaseAuditRepository();
    history.save(auditEntry());
    const report = releaseReport(
      'account (998877) Bearer secret-token 0x429082f221E9Ae10F5cE3A0AB6EdE8D3687EaF07 /Users/private/polyrader.db',
    );
    const service = new ReleaseDiagnosticsService({
      history,
      gates: { report: () => report },
    });

    const bundle = service.export();
    const serialized = JSON.stringify(bundle);

    expect(service.list('cs2')).toHaveLength(1);
    expect(service.get('audit-1')?.stageTimings[0]?.durationMs).toBe(12);
    expect(bundle.database.latestMigration).toBe('042_esports_team_aliases.sql');
    expect(bundle.database.migrationCount).toBe(42);
    expect(serialized).not.toContain('998877');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('429082f2');
    expect(serialized).not.toContain('/Users/private');
  });

  it('classifies provider failures without retaining upstream identifiers', () => {
    const raw =
      'InvalidSubscription for account (123456), Request id: request-1, see https://provider.example/renew';

    expect(classifyProviderFailure(raw)).toBe('subscription');
    expect(sanitizeDiagnosticText(raw)).toContain('account [redacted]');
    expect(sanitizeDiagnosticText(raw)).not.toContain('123456');
    expect(sanitizeDiagnosticText(raw)).not.toContain('provider.example');
  });
});

function auditEntry(): ReleaseAuditHistoryEntry {
  return {
    auditId: 'audit-1',
    game: 'cs2',
    outcome: 'failed',
    startedAt: '2026-07-22T00:00:00.000Z',
    finishedAt: '2026-07-22T00:00:01.000Z',
    durationMs: 1000,
    boardState: 'paper_ready',
    externalMatchId: 'match-1',
    dataSnapshotHash: 'sha256:current',
    syncStatus: 'success',
    sourceRecords: 10,
    analysisStatus: 'failed',
    provider: 'provider-a',
    providerFailure: { category: 'subscription', detail: 'sanitized' },
    gateStatus: 'blocked',
    stageTimings: [
      {
        stage: 'source_sync',
        status: 'passed',
        startedAt: '2026-07-22T00:00:00.000Z',
        finishedAt: '2026-07-22T00:00:00.012Z',
        durationMs: 12,
        detail: '10 records',
      },
    ],
    blockers: ['provider failed'],
  };
}

function releaseReport(blocker: string): ReleaseGateReport {
  return {
    generatedAt: '2026-07-22T00:00:00.000Z',
    releaseReady: false,
    verifiedCount: 0,
    fixtureReadyCount: 0,
    blockedCount: 1,
    boards: [
      {
        game: 'cs2',
        status: 'blocked',
        fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
        currentSource: { status: 'blocked', checkedAt: '', stages: [], blockers: [blocker] },
      },
    ],
  };
}
