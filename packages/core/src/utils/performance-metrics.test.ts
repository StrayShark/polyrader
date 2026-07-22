import { describe, expect, it } from 'vitest';
import { buildPerformanceSummary, brierForBet } from './performance-metrics';
import type { SimBet } from '../types';

function bet(partial: Partial<SimBet> & Pick<SimBet, 'id' | 'status' | 'result' | 'pnl'>): SimBet {
  return {
    accountId: 'default',
    betType: 'single',
    stake: 10,
    totalOdds: 2,
    placedAt: '2026-07-21T00:00:00.000Z',
    ...partial,
  };
}

describe('performance-metrics', () => {
  it('computes brier from modelProbability', () => {
    expect(brierForBet(bet({
      id: '1',
      status: 'settled',
      result: 'won',
      pnl: 10,
      modelProbability: 0.8,
    }))).toBeCloseTo(0.04, 5);
  });

  it('builds equity and attribution summary', () => {
    const summary = buildPerformanceSummary({
      initialBankroll: 10000,
      providerByRunId: { 'run-a': 'doubao' },
      bets: [
        bet({
          id: 'open',
          status: 'open',
          result: null,
          pnl: 0,
          game: 'cs2',
          runId: 'run-a',
        }),
        bet({
          id: 'win',
          status: 'settled',
          result: 'won',
          pnl: 20,
          game: 'cs2',
          marketKind: 'match_winner',
          runId: 'run-a',
          modelProbability: 0.7,
          edgeAtEntry: 0.05,
        }),
        bet({
          id: 'loss',
          status: 'settled',
          result: 'lost',
          pnl: -10,
          game: 'lol',
          marketKind: 'match_winner',
          modelProbability: 0.6,
          edgeAtEntry: 0.02,
        }),
      ],
    });

    expect(summary.openCount).toBe(1);
    expect(summary.settledCount).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.totalPnl).toBe(10);
    expect(summary.totalStake).toBe(20);
    expect(summary.roi).toBeCloseTo(0.5, 5);
    expect(summary.equity).toBe(10010);
    expect(summary.winRateInterval.low).toBeLessThan(summary.winRate);
    expect(summary.winRateInterval.high).toBeGreaterThan(summary.winRate);
    expect(summary.sampleStatus).toBe('insufficient');
    expect(summary.equityCurve).toHaveLength(2);
    expect(summary.maxDrawdown).toBe(10);
    expect(summary.calibrationError).toBeDefined();
    expect(summary.byGame[0]?.key).toBe('cs2');
    expect(summary.byProvider.some((row) => row.key === 'doubao')).toBe(true);
    expect(summary.byMarketKind[0]?.key).toBe('match_winner');
  });
});
