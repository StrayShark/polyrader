import { describe, expect, it } from 'vitest';
import {
  calculateClosedPositionPerformance,
  isQualifiedSmartWallet,
} from '../services/smart-wallet-discovery-service';
import type { PolymarketUserPosition } from '@polyrader/core';

function position(cashPnl: number, initialValue: number): PolymarketUserPosition {
  return {
    marketId: `market-${cashPnl}`,
    question: 'Resolved market',
    outcome: 'Yes',
    shares: 0,
    value: 0,
    cashPnl,
    initialValue,
  };
}

describe('Smart wallet discovery metrics', () => {
  it('computes win rate, PnL, wagered capital, and ROI from closed positions', () => {
    const metrics = calculateClosedPositionPerformance([
      position(60, 40),
      position(20, 80),
      position(-30, 50),
      position(0, 100),
    ]);

    expect(metrics).toEqual({
      winRate: 2 / 3,
      totalPnl: 50,
      settledBets: 3,
      wins: 2,
      losses: 1,
      totalWagered: 170,
      roi: 50 / 170,
    });
  });

  it('requires sample size, win rate, and positive ROI for copy qualification', () => {
    expect(isQualifiedSmartWallet({
      winRate: 0.7,
      totalPnl: -20,
      settledBets: 20,
      wins: 14,
      losses: 6,
      totalWagered: 1000,
      roi: -0.02,
    })).toBe(false);
    expect(isQualifiedSmartWallet({
      winRate: 0.65,
      totalPnl: 50,
      settledBets: 20,
      wins: 13,
      losses: 7,
      totalWagered: 1000,
      roi: 0.05,
    })).toBe(true);
  });
});
