import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, closeDb, PolymarketDataClient, runMigrations, WhaleRepository } from '@polyrader/infra';
import { WhaleService } from '../services/whale-service';
import type { Whale } from '@polyrader/core';

const testDbPath = path.join(process.cwd(), 'data', 'whale-service-test.db');

describe('WhaleService leaderboard ordering', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
    clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
    clearCache();
  });

  it('preserves performance fields and sorts high-win wallets by win rate', async () => {
    const repo = new WhaleRepository();
    seed(repo, '0x1111111111111111111111111111111111111111', 0.65, 30, 0.12, 2000, 50000);
    seed(repo, '0x2222222222222222222222222222222222222222', 0.75, 20, 0.2, 3000, 25000);
    seed(repo, '0x3333333333333333333333333333333333333333', 0.8, 25, -0.05, -500, 40000);

    const whales = await new WhaleService().getWhales({
      sort: 'win_rate',
      minSamples: 10,
      minWinRate: 0.6,
      minRoi: 0.02,
    });

    expect(whales.map((whale) => whale.address)).toEqual([
      '0x2222222222222222222222222222222222222222',
      '0x1111111111111111111111111111111111111111',
    ]);
    expect(whales[0]).toEqual(expect.objectContaining({
      winRate: 0.75,
      settledBets: 20,
      roi: 0.2,
      pnl: 3000,
    }));
  });

  it('queries closed positions for wallet win rate when no local trades exist', async () => {
    vi.spyOn(PolymarketDataClient.prototype, 'getClosedPositions').mockResolvedValue([
      position('m1', 80, 100),
      position('m2', 20, 100),
      position('m3', -50, 100),
    ]);
    vi.spyOn(PolymarketDataClient.prototype, 'getTrades').mockResolvedValue([]);

    const detail = await new WhaleService().getWhaleDetail('0x4444444444444444444444444444444444444444');

    expect(detail?.performance).toEqual(expect.objectContaining({
      settledBets: 3,
      wins: 2,
      losses: 1,
      winRate: 2 / 3,
      totalPnl: 50,
      totalWagered: 300,
      roi: 50 / 300,
    }));
    expect(detail?.winRate).toBeCloseTo(2 / 3);
  });
});

function seed(
  repo: WhaleRepository,
  address: string,
  winRate: number,
  settledBets: number,
  roi: number,
  pnl: number,
  volume: number,
): void {
  const whale: Whale = {
    address,
    totalVolume: volume,
    totalPositions: settledBets,
    activePositions: 0,
    winRate,
    pnl,
    suspiciousScore: {
      total: 0,
      volumeAnomaly: 0,
      timingAnomaly: 0,
      patternAnomaly: 0,
      correlationAnomaly: 0,
    },
    recentTrades: [],
    lastActive: '2026-07-20T00:00:00Z',
  };
  repo.upsert(whale);
  repo.updatePerformance(address, {
    winRate,
    totalPnl: pnl,
    settledBets,
    wins: Math.round(settledBets * winRate),
    losses: settledBets - Math.round(settledBets * winRate),
    totalWagered: pnl / roi,
    roi,
  });
}

function position(marketId: string, cashPnl: number, initialValue: number) {
  return {
    marketId,
    question: `${marketId} question`,
    outcome: 'Yes',
    shares: 1,
    value: 0,
    cashPnl,
    initialValue,
  };
}
