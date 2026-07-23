import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../connection', () => ({
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] =>
    testDb.prepare(sql).all(...params) as T[],
  queryOne: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined =>
    (testDb.prepare(sql).get(...params) as T) ?? undefined,
}));

import { LLMRepository } from '../repositories/llm-repository';

describe('LLMRepository.getUpcomingMatches', () => {
  beforeEach(() => {
    testDb?.close();
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE matches (
        match_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        scheduled_at TEXT NOT NULL
      );
      INSERT INTO matches VALUES
        ('stale', 'scheduled', datetime('now', '-2 hours')),
        ('grace', 'upcoming', datetime('now', '-10 minutes')),
        ('next', 'scheduled', datetime('now', '+1 hour')),
        ('later', 'pre_match', datetime('now', '+3 hours')),
        ('finished', 'finished', datetime('now', '+30 minutes'));
    `);
  });

  it('keeps a short delay grace window and excludes stale active-state rows', () => {
    const rows = new LLMRepository().getUpcomingMatches(10);

    expect(rows.map((row) => row.match_id)).toEqual(['grace', 'next', 'later']);
  });
});
