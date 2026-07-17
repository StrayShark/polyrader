import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

vi.mock('../../connection', () => ({
  getDb: () => testDb,
  query: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] => {
    const stmt = testDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params) as T[];
    }
    stmt.run(...params);
    return [];
  },
  queryOne: <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined => {
    return (testDb.prepare(sql).get(...params) as T) ?? undefined;
  },
  transaction: <T>(fn: () => T): T => {
    const tx = testDb.transaction(fn);
    return tx();
  },
  closeDb: () => {
    if (testDb) testDb.close();
  },
}));

import { SimAccountRepository } from '../sim-account-repository';
import { SimBetRepository } from '../sim-bet-repository';
import { OddsSnapshotRepository } from '../odds-snapshot-repository';
import { BetReviewRepository } from '../bet-review-repository';

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE sim_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '练习账户',
      initial_bankroll REAL NOT NULL DEFAULT 10000,
      current_bankroll REAL NOT NULL DEFAULT 10000,
      available_bankroll REAL NOT NULL DEFAULT 10000,
      open_exposure REAL NOT NULL DEFAULT 0,
      max_single_risk_pct REAL NOT NULL DEFAULT 0.02,
      max_daily_risk_pct REAL NOT NULL DEFAULT 0.06,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sim_bets (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES sim_accounts(id),
      match_id TEXT,
      market_id TEXT,
      bet_type TEXT NOT NULL DEFAULT 'single',
      stake REAL NOT NULL,
      total_odds REAL NOT NULL,
      implied_probability REAL,
      user_probability REAL,
      model_probability REAL,
      market_probability REAL,
      edge REAL,
      ev REAL,
      status TEXT NOT NULL DEFAULT 'open',
      result TEXT,
      pnl REAL NOT NULL DEFAULT 0,
      reasoning TEXT,
      match_format TEXT,
      match_tier TEXT,
      placed_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT
    );

    CREATE TABLE sim_bet_legs (
      id TEXT PRIMARY KEY,
      bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
      match_id TEXT,
      market_id TEXT,
      selection TEXT NOT NULL,
      odds REAL NOT NULL,
      implied_probability REAL,
      source TEXT,
      result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE odds_snapshots (
      id TEXT PRIMARY KEY,
      match_id TEXT,
      market_id TEXT,
      selection TEXT,
      odds REAL NOT NULL,
      implied_probability REAL,
      liquidity REAL,
      volume_24h REAL,
      source TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE bet_reviews (
      id TEXT PRIMARY KEY,
      bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
      error_tags TEXT NOT NULL DEFAULT '[]',
      note TEXT,
      brier_score REAL,
      closing_line_value REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('SimAccountRepository', () => {
  let repo: SimAccountRepository;

  beforeAll(() => {
    repo = new SimAccountRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('creates a default account on first access', () => {
    const account = repo.getDefault();
    expect(account.id).toBe('default');
    expect(account.initialBankroll).toBe(10000);
    expect(account.currentBankroll).toBe(10000);
    expect(account.availableBankroll).toBe(10000);
    expect(account.maxSingleRiskPct).toBe(0.02);
  });

  it('retrieves account by id', () => {
    repo.getDefault();
    const fetched = repo.getById('default');
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe('练习账户');
  });

  it('updates account risk params and bankroll', () => {
    repo.getDefault();
    const updated = repo.update('default', {
      name: 'Aggressive Practice',
      maxSingleRiskPct: 0.05,
      maxDailyRiskPct: 0.15,
    });

    expect(updated.name).toBe('Aggressive Practice');
    expect(updated.maxSingleRiskPct).toBe(0.05);
    expect(updated.maxDailyRiskPct).toBe(0.15);
  });

  it('updates bankroll and exposure', () => {
    repo.getDefault();
    const updated = repo.updateBankroll('default', 9500, 9200, 300);
    expect(updated.currentBankroll).toBe(9500);
    expect(updated.availableBankroll).toBe(9200);
    expect(updated.openExposure).toBe(300);
  });
});

describe('SimBetRepository', () => {
  let accountRepo: SimAccountRepository;
  let repo: SimBetRepository;

  beforeAll(() => {
    accountRepo = new SimAccountRepository();
    repo = new SimBetRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('creates a single bet with legs', () => {
    const account = accountRepo.getDefault();
    const { bet, legs } = repo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      impliedProbability: 0.5,
      userProbability: 0.6,
      edge: 0.1,
      ev: 20,
      reasoning: 'Test bet',
      legs: [
        { selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1', source: 'polymarket' },
      ],
    });

    expect(bet.id).toMatch(/^sbet-/);
    expect(bet.status).toBe('open');
    expect(bet.userProbability).toBe(0.6);
    expect(legs).toHaveLength(1);
    expect(legs[0].selection).toBe('Team A');
    expect(legs[0].betId).toBe(bet.id);
  });

  it('retrieves a bet with legs', () => {
    const account = accountRepo.getDefault();
    const { bet } = repo.create({
      accountId: account.id,
      betType: 'parlay',
      stake: 50,
      totalOdds: 4.0,
      legs: [
        { selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' },
        { selection: 'Team B', odds: 2.0, matchId: 'match-2', marketId: 'market-2' },
      ],
    });

    const withLegs = repo.getWithLegs(bet.id);
    expect(withLegs).toBeDefined();
    expect(withLegs!.legs).toHaveLength(2);
  });

  it('filters bets by status', () => {
    const account = accountRepo.getDefault();
    repo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    const open = repo.getByAccount(account.id, 'open');
    expect(open).toHaveLength(1);

    const settled = repo.getByAccount(account.id, 'settled');
    expect(settled).toHaveLength(0);
  });

  it('settles a bet and updates status', () => {
    const account = accountRepo.getDefault();
    const { bet } = repo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    const settled = repo.settle(bet.id, 'won', 100);
    expect(settled.status).toBe('settled');
    expect(settled.result).toBe('won');
    expect(settled.pnl).toBe(100);
    expect(settled.settledAt).toBeDefined();
  });

  it('settles individual legs', () => {
    const account = accountRepo.getDefault();
    const { legs } = repo.create({
      accountId: account.id,
      betType: 'parlay',
      stake: 100,
      totalOdds: 4.0,
      legs: [
        { selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' },
        { selection: 'Team B', odds: 2.0, matchId: 'match-2', marketId: 'market-2' },
      ],
    });

    const settledLeg = repo.settleLeg(legs[0].id, 'won');
    expect(settledLeg.result).toBe('won');
  });

  it('calculates open exposure', () => {
    const account = accountRepo.getDefault();
    repo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    expect(repo.getOpenBetsTotalExposure(account.id)).toBe(100);
  });

  it('cascades delete to legs', () => {
    const account = accountRepo.getDefault();
    const { bet } = repo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    expect(repo.getLegs(bet.id)).toHaveLength(1);

    testDb.prepare('DELETE FROM sim_bets WHERE id = ?').run(bet.id);

    expect(repo.getLegs(bet.id)).toHaveLength(0);
  });
});

describe('OddsSnapshotRepository', () => {
  let repo: OddsSnapshotRepository;

  beforeAll(() => {
    repo = new OddsSnapshotRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('creates and retrieves odds snapshots', () => {
    const snapshot = repo.create({
      matchId: 'match-1',
      marketId: 'market-1',
      selection: 'Team A',
      odds: 2.0,
      impliedProbability: 0.5,
      source: 'polymarket',
    });

    expect(snapshot.id).toMatch(/^osnap-/);
    expect(snapshot.odds).toBe(2.0);

    const fetched = repo.getById(snapshot.id);
    expect(fetched).toBeDefined();
    expect(fetched!.selection).toBe('Team A');
  });

  it('finds snapshots by bet context', () => {
    repo.create({
      matchId: 'match-1',
      marketId: 'market-1',
      selection: 'Team A',
      odds: 2.0,
      source: 'polymarket',
    });

    const found = repo.getByBetContext('match-1', 'market-1', 'Team A');
    expect(found).toHaveLength(1);
    expect(found[0].odds).toBe(2.0);
  });

  it('falls back to all snapshots when context is partial', () => {
    repo.create({ matchId: 'match-1', marketId: 'market-1', selection: 'Team A', odds: 2.0, source: 'a' });
    repo.create({ matchId: 'match-2', marketId: 'market-2', selection: 'Team C', odds: 3.0, source: 'b' });

    const all = repo.getByBetContext();
    expect(all).toHaveLength(2);
  });
});

describe('BetReviewRepository', () => {
  let accountRepo: SimAccountRepository;
  let betRepo: SimBetRepository;
  let repo: BetReviewRepository;

  beforeAll(() => {
    accountRepo = new SimAccountRepository();
    betRepo = new SimBetRepository();
    repo = new BetReviewRepository();
  });

  beforeEach(() => {
    if (testDb) testDb.close();
    setupTestDb();
  });

  it('creates and retrieves a review', () => {
    const account = accountRepo.getDefault();
    const { bet } = betRepo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    const review = repo.create({
      betId: bet.id,
      errorTags: ['overestimated_favorite', 'ignored_map_pool'],
      note: 'Need to factor map veto more.',
      brierScore: 0.25,
      closingLineValue: 0.05,
    });

    expect(review.betId).toBe(bet.id);
    expect(review.errorTags).toEqual(['overestimated_favorite', 'ignored_map_pool']);
    expect(review.note).toBe('Need to factor map veto more.');

    const fetched = repo.getByBetId(bet.id);
    expect(fetched).toBeDefined();
    expect(fetched!.brierScore).toBe(0.25);
  });

  it('updates a review', () => {
    const account = accountRepo.getDefault();
    const { bet } = betRepo.create({
      accountId: account.id,
      betType: 'single',
      stake: 100,
      totalOdds: 2.0,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    repo.create({ betId: bet.id, note: 'Initial note' });
    const updated = repo.update(bet.id, {
      note: 'Updated note',
      brierScore: 0.1,
    });

    expect(updated).toBeDefined();
    expect(updated!.note).toBe('Updated note');
    expect(updated!.brierScore).toBe(0.1);
  });

  it('returns undefined for non-existent review', () => {
    expect(repo.getByBetId('sbet-does-not-exist')).toBeUndefined();
  });
});
