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
      CREATE TABLE esports_match_source_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT, canonical_match_id TEXT,
        scope TEXT, source TEXT, external_id TEXT, parent_canonical_match_id TEXT,
        event_id TEXT, team_a_id TEXT, team_b_id TEXT, starts_at TEXT,
        confidence REAL, observed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(game, source, external_id)
      );
      CREATE TABLE esports_team_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT, source TEXT,
        source_team_id TEXT NOT NULL DEFAULT '', alias TEXT, normalized_alias TEXT,
        canonical_team_id TEXT, target_source TEXT, target_team_id TEXT, status TEXT,
        method TEXT, confidence REAL, candidate_team_ids TEXT, evidence TEXT,
        observed_at TEXT, confirmed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(game, source, source_team_id, normalized_alias)
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

  it('persists source-native games under a canonical series hierarchy', () => {
    const repo = new EsportsSourceRepository();
    repo.upsertMatchIdentities([
      {
        game: 'dota2',
        canonicalMatchId: 'dota2:series:202607221200:falcons:liquid',
        scope: 'series',
        source: 'grid',
        externalId: 'grid-series-1',
        teamAId: 'liquid-grid',
        teamBId: 'falcons-grid',
        startsAt: '2026-07-22T12:00:00Z',
        confidence: 0.9,
        observedAt: '2026-07-21T00:00:00Z',
      },
      {
        game: 'dota2',
        canonicalMatchId: 'dota2:game:opendota:123',
        parentCanonicalMatchId: 'dota2:series:opendota:456',
        scope: 'game',
        source: 'opendota',
        externalId: '123',
        confidence: 1,
        observedAt: '2026-07-22T13:00:00Z',
      },
    ]);

    expect(repo.countMatchIdentities('dota2')).toBe(2);
    expect(
      repo.listMatchIdentities('dota2', {
        canonicalMatchId: 'dota2:series:opendota:456',
      }),
    ).toEqual([
      expect.objectContaining({
        scope: 'game',
        source: 'opendota',
        parentCanonicalMatchId: 'dota2:series:opendota:456',
      }),
    ]);
  });

  it('keeps a manual team alias confirmation when sync evidence is refreshed', () => {
    const repo = new EsportsSourceRepository();
    const base = {
      game: 'dota2' as const,
      source: 'liquipedia' as const,
      sourceTeamId: 'Team_Liquid',
      alias: 'Liquid',
      normalizedAlias: 'liquid',
      targetSource: 'opendota' as const,
      candidateTeamIds: ['2163'],
      evidence: {},
      observedAt: '2026-07-22T00:00:00Z',
    };
    repo.upsertTeamAliases([
      {
        ...base,
        canonicalTeamId: '2163',
        targetTeamId: '2163',
        status: 'confirmed',
        method: 'manual_review',
        confidence: 1,
        confirmedAt: '2026-07-22T00:00:00Z',
      },
    ]);
    repo.upsertTeamAliases([
      {
        ...base,
        canonicalTeamId: undefined,
        targetTeamId: undefined,
        status: 'unmatched',
        method: 'none',
        confidence: 0,
        observedAt: '2026-07-23T00:00:00Z',
      },
    ]);

    expect(repo.listTeamAliases('dota2')).toEqual([
      expect.objectContaining({
        status: 'confirmed',
        targetTeamId: '2163',
        confirmedAt: '2026-07-22T00:00:00Z',
      }),
    ]);
  });

  it('keeps a manual team alias rejection when sync reports the conflict again', () => {
    const repo = new EsportsSourceRepository();
    const base = {
      game: 'dota2' as const,
      source: 'liquipedia' as const,
      sourceTeamId: 'Team_Spirit_Academy',
      alias: 'Team Spirit Academy',
      normalizedAlias: 'team spirit academy',
      targetSource: 'opendota' as const,
    };
    repo.upsertTeamAliases([
      {
        ...base,
        status: 'rejected',
        method: 'manual_review',
        confidence: 0,
        candidateTeamIds: [],
        evidence: { reason: 'Candidates resolve to the senior team.' },
        observedAt: '2026-07-22T00:00:00Z',
      },
    ]);
    repo.upsertTeamAliases([
      {
        ...base,
        status: 'conflict',
        method: 'token_overlap',
        confidence: 0.7,
        candidateTeamIds: ['2621843', '7119388'],
        evidence: { source: 'automatic-sync' },
        observedAt: '2026-07-23T00:00:00Z',
      },
    ]);

    expect(repo.listTeamAliases('dota2')).toEqual([
      expect.objectContaining({
        status: 'rejected',
        method: 'manual_review',
        candidateTeamIds: [],
        evidence: { reason: 'Candidates resolve to the senior team.' },
        observedAt: '2026-07-22T00:00:00Z',
      }),
    ]);
  });
});
