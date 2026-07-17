import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations, closeDb, SimAccountRepository } from '@polyrader/infra';
import { BankrollService } from '../services/bankroll-service';
import { SimBetService } from '../services/sim-bet-service';

const testDbPath = path.join(process.cwd(), 'data', 'bankroll-service-test.db');

describe('BankrollService', () => {
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

  it('returns default account and empty metrics when no bets', () => {
    const service = new BankrollService();
    const summary = service.getSummary('default');

    expect(summary.account.currentBankroll).toBe(10000);
    expect(summary.openExposure).toBe(0);
    expect(summary.equityCurve).toHaveLength(0);
    expect(summary.openBets).toHaveLength(0);
    expect(summary.settledBets).toHaveLength(0);
    expect(summary.riskMetrics.totalBets).toBe(0);
  });

  it('reflects open exposure after placing a bet', () => {
    const betService = new SimBetService();
    betService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    const service = new BankrollService();
    const summary = service.getSummary('default');

    expect(summary.openExposure).toBe(100);
    expect(summary.openBets).toHaveLength(1);
    expect(summary.account.availableBankroll).toBe(9900);
  });

  it('computes equity curve and risk metrics after settlement', () => {
    const betService = new SimBetService();
    const { bet } = betService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });
    betService.settleBet(bet.id, 'won');

    const service = new BankrollService();
    const summary = service.getSummary('default', 'all');

    expect(summary.equityCurve).toHaveLength(1);
    expect(summary.equityCurve[0].equity).toBe(10100);
    expect(summary.riskMetrics.totalBets).toBe(1);
    expect(summary.riskMetrics.winRate).toBe(1);
    expect(summary.riskMetrics.roi).toBe(1);
    expect(summary.riskMetrics.maxDrawdown).toBe(0);
  });

  it('aggregates equity curve by day', () => {
    const betService = new SimBetService();
    const { bet: bet1 } = betService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0 }],
    });
    betService.settleBet(bet1.id, 'lost');

    const { bet: bet2 } = betService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team B', odds: 2.0 }],
    });
    betService.settleBet(bet2.id, 'won');

    const service = new BankrollService();
    const summary = service.getSummary('default', 'day');

    expect(summary.equityCurve.length).toBeGreaterThanOrEqual(1);
    expect(summary.equityCurve[summary.equityCurve.length - 1].equity).toBe(10000);
  });

  it('tracks max drawdown and consecutive losses', () => {
    const betService = new SimBetService();

    // Force larger stakes by updating risk limits
    const repo = new SimAccountRepository();
    repo.update('default', { maxSingleRiskPct: 1.0, maxDailyRiskPct: 1.0 });

    // Lose 3 in a row
    for (let i = 0; i < 3; i++) {
      const { bet } = betService.placeBet({
        betType: 'single',
        stake: 100,
        legs: [{ selection: `Team ${i}`, odds: 2.0 }],
      });
      betService.settleBet(bet.id, 'lost');
    }

    const service = new BankrollService();
    const summary = service.getSummary('default');

    expect(summary.riskMetrics.consecutiveLosses).toBe(3);
    expect(summary.riskMetrics.maxDrawdown).toBe(300);
    expect(summary.riskMetrics.maxDrawdownPct).toBe(0.03);
  });
});
