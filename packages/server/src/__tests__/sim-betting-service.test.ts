import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations, closeDb, SimAccountRepository, OddsSnapshotRepository } from '@polyrader/infra';
import { SimBetService } from '../services/sim-bet-service';
import { BankrollService } from '../services/bankroll-service';
import { SimAccountService } from '../services/sim-account-service';

// SimBetService must never import or call live order clients. This guard
// ensures the module dependency graph stays clean.
vi.mock('../services/market-order-service', () => ({
  MarketOrderService: vi.fn(() => {
    throw new Error('MarketOrderService should not be instantiated by sim betting');
  }),
}));

const testDbPath = path.join(process.cwd(), 'data', 'sim-betting-test.db');

describe('SimBetService', () => {
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

  it('creates a default practice account on first access', () => {
    const service = new SimAccountService();
    const account = service.getDefaultAccount();
    expect(account.id).toBe('default');
    expect(account.currentBankroll).toBe(10000);
    expect(account.availableBankroll).toBe(10000);
  });

  it('places a single practice bet and updates exposure', () => {
    const service = new SimBetService();
    const result = service.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
      reasoning: 'Test practice bet',
    });

    expect(result.bet.status).toBe('open');
    expect(result.bet.stake).toBe(100);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].selection).toBe('Team A');

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.openExposure).toBe(100);
    expect(bankroll.account.availableBankroll).toBe(9900);

    const snapshots = new OddsSnapshotRepository().getByBetContext('match-1', 'market-1', 'Team A');
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('rejects bets that exceed single risk limit', () => {
    const service = new SimBetService();
    expect(() =>
      service.placeBet({
        betType: 'single',
        stake: 500,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      }),
    ).toThrow(/exceeds max single risk/);
  });

  it('rejects bets that exceed available bankroll', () => {
    const accountRepo = new SimAccountRepository();
    accountRepo.update('default', { maxSingleRiskPct: 1.0 });
    const service = new SimBetService();
    expect(() =>
      service.placeBet({
        betType: 'single',
        stake: 20000,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      }),
    ).toThrow(/Insufficient available bankroll/);
  });

  it('settles a winning bet and updates bankroll', () => {
    const service = new SimBetService();
    const { bet } = service.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    const settled = service.settleBet(bet.id, 'won');
    expect(settled.status).toBe('settled');
    expect(settled.result).toBe('won');
    expect(settled.pnl).toBe(100);

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(10100);
    expect(bankroll.openExposure).toBe(0);
  });

  it('settles a losing bet and updates bankroll', () => {
    const service = new SimBetService();
    const { bet } = service.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });

    const settled = service.settleBet(bet.id, 'lost');
    expect(settled.status).toBe('settled');
    expect(settled.result).toBe('lost');
    expect(settled.pnl).toBe(-100);

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(9900);
  });
});
