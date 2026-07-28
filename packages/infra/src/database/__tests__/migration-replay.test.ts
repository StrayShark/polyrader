import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, runMigrations } from '../index';
import { SimBetRepository } from '../repositories/sim-bet-repository';

const testDbPath = path.join(process.cwd(), 'data', 'migration-replay-test.db');
const migrationsDir = path.join(process.cwd(), 'src', 'database', 'migrations');

function removeTestDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${testDbPath}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function buildSchemaThrough037(): void {
  const db = new Database(testDbPath);
  try {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) <= 37)
      .sort();
    for (const name of files) {
      db.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    }
    db.prepare(
      `INSERT INTO sim_bets (
        id, account_id, match_id, market_id, bet_type, stake, total_odds,
        model_probability, market_probability, status, result, pnl,
        run_id, report_id, policy_version, game, market_kind, edge_at_entry,
        placed_at, settled_at
      ) VALUES (?, ?, ?, ?, 'single', 10, 2, 0.6, 0.5, 'settled', 'won', 10,
        NULL, NULL, 'paper.v1.1.0', 'cs2', 'match_winner', 0.1, ?, ?)`,
    ).run(
      'legacy-sprint-f-bet',
      'default',
      'legacy-match',
      'legacy-market',
      '2026-07-20T10:00:00.000Z',
      '2026-07-20T12:00:00.000Z',
    );
  } finally {
    db.close();
  }
}

describe('migration replay and restart persistence', () => {
  afterEach(() => {
    closeDb();
    delete process.env.DATABASE_URL;
    removeTestDb();
  });

  it('upgrades a migration-037 database through the latest migration and preserves telemetry after reopen', () => {
    removeTestDb();
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    buildSchemaThrough037();
    process.env.DATABASE_URL = testDbPath;

    runMigrations();
    const repo = new SimBetRepository();
    const migrated = repo.getById('legacy-sprint-f-bet');
    expect(migrated).toMatchObject({
      id: 'legacy-sprint-f-bet',
      game: 'cs2',
      marketKind: 'match_winner',
      clvStatus: 'pending',
      closingAttemptCount: 0,
    });

    repo.recordClosingAttempt('legacy-sprint-f-bet', {
      attemptedAt: '2026-07-20T11:59:50.000Z',
      boundaryAt: '2026-07-20T12:00:00.000Z',
    });
    repo.recordClosingPrice('legacy-sprint-f-bet', {
      closingOdds: 1.8,
      closingProbability: 1 / 1.8,
      closingCapturedAt: '2026-07-20T12:00:10.000Z',
      closingSource: 'migration-replay',
      closingBoundaryAt: '2026-07-20T12:00:00.000Z',
      closingLatencySeconds: 10,
      clv: 2 / 1.8 - 1,
    });

    const beforeRestart = getDb().prepare('SELECT COUNT(*) AS count FROM sim_bets').get() as {
      count: number;
    };
    expect(beforeRestart.count).toBe(1);
    closeDb();

    runMigrations();
    const reopened = new SimBetRepository().getById('legacy-sprint-f-bet');
    expect(reopened).toMatchObject({
      closingSource: 'migration-replay',
      closingAttemptCount: 1,
      closingLatencySeconds: 10,
      clvStatus: 'captured',
    });
    expect(reopened?.closingOdds).toBeCloseTo(1.8, 6);
    expect(reopened?.clv).toBeCloseTo(2 / 1.8 - 1, 6);

    const migrationCount = getDb().prepare('SELECT COUNT(*) AS count FROM _migrations').get() as {
      count: number;
    };
    const expectedMigrationCount = fs
      .readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.sql$/.test(name)).length;
    expect(migrationCount.count).toBe(expectedMigrationCount);
    const aliasesTable = getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'esports_team_aliases'",
      )
      .get() as { name: string } | undefined;
    expect(aliasesTable?.name).toBe('esports_team_aliases');
    const releaseAuditTable = getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'release_audit_runs'",
      )
      .get() as { name: string } | undefined;
    expect(releaseAuditTable?.name).toBe('release_audit_runs');
    const identityTable = getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'esports_match_source_identities'",
      )
      .get() as { name: string } | undefined;
    expect(identityTable?.name).toBe('esports_match_source_identities');
    const resultAnalysisTable = getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bet_result_analyses'",
      )
      .get() as { name: string } | undefined;
    expect(resultAnalysisTable?.name).toBe('bet_result_analyses');
    const columns = getDb().prepare('PRAGMA table_info(sim_bets)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'provider',
        'closing_boundary_at',
        'closing_latency_seconds',
        'closing_attempt_count',
        'clv_unavailable_reason',
        'settlement_source',
      ]),
    );
  });
});
