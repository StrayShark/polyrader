import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../../connection', () => ({
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] => {
    const statement = testDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) return statement.all(...params) as T[];
    statement.run(...params);
    return [];
  },
  queryOne: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined =>
    testDb.prepare(sql).get(...params) as T | undefined,
  transaction: <T>(fn: () => T): T => testDb.transaction(fn)(),
}));

import { EsportsSourceRepository } from '../esports-source-repository';

describe('EsportsSourceRepository', () => {
  beforeEach(() => {
    testDb?.close();
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE esports_source_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT, source TEXT, entity_type TEXT,
        external_id TEXT, name TEXT, starts_at TEXT, status TEXT, payload TEXT,
        observed_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(game, source, entity_type, external_id)
      );
      CREATE TABLE esports_source_sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT, status TEXT, records INTEGER,
        sources TEXT, started_at TEXT, finished_at TEXT, created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  it('keeps games isolated and updates repeated source entities', () => {
    const repo = new EsportsSourceRepository();
    const base = {
      source: 'grid' as const,
      entityType: 'match' as const,
      externalId: 'series-1',
      name: 'A vs B',
      observedAt: '2026-07-21T00:00:00Z',
    };
    repo.upsertSnapshots([
      { ...base, game: 'lol', payload: { version: 1 } },
      { ...base, game: 'valorant', payload: { version: 1 } },
      { ...base, game: 'lol', name: 'A vs C', payload: { version: 2 } },
    ]);

    expect(repo.listSnapshots('lol')).toHaveLength(1);
    expect(repo.listSnapshots('lol')[0].name).toBe('A vs C');
    expect(repo.listSnapshots('lol')[0].payload.version).toBe(2);
    expect(repo.listSnapshots('valorant')).toHaveLength(1);
  });

  it('records and reads the latest sync result', () => {
    const repo = new EsportsSourceRepository();
    repo.recordSyncRun({
      game: 'dota2', status: 'success', records: 4,
      sources: [{ source: 'opendota', status: 'success', records: 4 }],
      startedAt: '2026-07-21T00:00:00Z', finishedAt: '2026-07-21T00:00:01Z',
    });

    expect(repo.getLatestSyncRun('dota2')).toMatchObject({ status: 'success', records: 4 });
  });
});
