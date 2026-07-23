import { describe, expect, it } from 'vitest';
import {
  buildPerformanceSummary,
  brierForBet,
  logLossForBet,
  isAuthoritativeSettlement,
  RANKING_MIN_AUTHORITATIVE_SETTLEMENTS,
  TUNING_MIN_AUTHORITATIVE_SETTLEMENTS,
} from './performance-metrics';
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
    expect(
      brierForBet(
        bet({
          id: '1',
          status: 'settled',
          result: 'won',
          pnl: 10,
          modelProbability: 0.8,
        }),
      ),
    ).toBeCloseTo(0.04, 5);
    expect(
      logLossForBet(
        bet({
          id: '1',
          status: 'settled',
          result: 'won',
          pnl: 10,
          modelProbability: 0.8,
        }),
      ),
    ).toBeCloseTo(-Math.log(0.8), 5);
  });

  it('builds equity and attribution summary', () => {
    const summary = buildPerformanceSummary({
      initialBankroll: 10000,
      providerByRunId: { 'run-a': 'doubao' },
      runMetadataByRunId: {
        'run-a': { dataQuality: 0.9, confidence: 0.8 },
      },
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
          matchTier: 'S',
          runId: 'run-a',
          modelProbability: 0.7,
          edgeAtEntry: 0.05,
          clv: 0.04,
          clvStatus: 'captured',
          closingSource: 'market_history',
          closingAttemptCount: 1,
          closingLatencySeconds: 30,
          settlementSource: 'hltv',
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
          clvStatus: 'unavailable',
          clvUnavailableReason: 'NO_RELIABLE_CLOSING_PRICE',
          closingAttemptCount: 2,
          settlementSource: 'grid',
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
    expect(summary.rankingStatus).toBe('hidden');
    expect(summary.tuningEligible).toBe(false);
    expect(summary.equityCurve).toHaveLength(2);
    expect(summary.maxDrawdown).toBe(10);
    expect(summary.calibrationError).toBeDefined();
    expect(summary.avgClv).toBeCloseTo(0.04, 5);
    expect(summary.avgLogLoss).toBeCloseTo((-Math.log(0.7) - Math.log(0.4)) / 2, 5);
    expect(summary.returnVolatility).toBeCloseTo(Math.sqrt(4.5), 5);
    expect(summary.sharpeRatio).toBeCloseTo(1 / 3, 5);
    expect(summary.clvSampleCount).toBe(1);
    expect(summary.clvMissingCount).toBe(1);
    expect(summary.closingCoverage.coverageRate).toBe(0.5);
    expect(summary.closingCoverage.averageAttempts).toBe(1.5);
    expect(summary.closingCoverage.averageCaptureLatencySeconds).toBe(30);
    expect(summary.closingCoverage.sources).toEqual([
      { source: 'market_history', count: 1, coverageRate: 0.5 },
    ]);
    expect(summary.closingCoverage.unavailableReasons).toEqual([
      { reason: 'NO_RELIABLE_CLOSING_PRICE', count: 1 },
    ]);
    expect(summary.byGame[0]?.key).toBe('cs2');
    expect(summary.byProvider.some((row) => row.key === 'doubao')).toBe(true);
    expect(summary.byMarketKind[0]?.key).toBe('match_winner');
    expect(summary.byPolicy[0]?.key).toBe('unknown');
    expect(summary.byPromptVersion[0]?.key).toBe('manual');
    expect(summary.byEventTier.some((row) => row.key === 'S')).toBe(true);
    expect(summary.byDataQuality.some((row) => row.key === 'high (>=85%)')).toBe(true);
    expect(summary.byConfidenceBand.some((row) => row.key === 'high (>=75%)')).toBe(true);
    expect(summary.byEdgeBand.some((row) => row.key === '5-10%')).toBe(true);
    expect(summary.byGame.find((row) => row.key === 'cs2')?.items[0]).toMatchObject({
      betId: 'win',
      runId: 'run-a',
      result: 'won',
    });
    expect(summary.byGame.find((row) => row.key === 'cs2')?.avgClv).toBeCloseTo(0.04, 5);
    expect(summary.byGame.find((row) => row.key === 'cs2')?.clvCoverageRate).toBe(1);
    expect(summary.byGame.find((row) => row.key === 'cs2')?.rankingStatus).toBe('hidden');
    expect(summary.byGame.find((row) => row.key === 'cs2')?.rank).toBeUndefined();
  });

  it('enforces the 10/30 ranking and tuning thresholds', () => {
    const settled = Array.from({ length: 30 }, (_, index) =>
      bet({
        id: `threshold-${index}`,
        status: 'settled',
        result: index % 2 === 0 ? 'won' : 'lost',
        pnl: index % 2 === 0 ? 10 : -10,
        game: index < 9 ? 'lol' : 'cs2',
        settlementSource: 'hltv',
      }),
    );

    const nine = buildPerformanceSummary({ bets: settled.slice(0, 9), initialBankroll: 10000 });
    const ten = buildPerformanceSummary({ bets: settled.slice(0, 10), initialBankroll: 10000 });
    const thirty = buildPerformanceSummary({ bets: settled, initialBankroll: 10000 });

    expect(nine.rankingStatus).toBe('hidden');
    expect(ten.rankingStatus).toBe('provisional');
    expect(ten.tuningEligible).toBe(false);
    expect(thirty.rankingStatus).toBe('eligible');
    expect(thirty.tuningEligible).toBe(true);
    expect(thirty.byGame.find((row) => row.key === 'lol')?.rankingStatus).toBe('hidden');
    expect(thirty.byGame.find((row) => row.key === 'cs2')?.rank).toBe(1);
  });

  it('excludes manual and fixture settlements from ranking gates', () => {
    const authoritative = bet({
      id: 'auth',
      status: 'settled',
      result: 'won',
      pnl: 10,
      settlementSource: 'hltv',
    });
    const manual = bet({
      id: 'manual',
      status: 'settled',
      result: 'won',
      pnl: 10,
      settlementSource: 'manual',
    });
    const fixture = bet({
      id: 'fixture',
      status: 'settled',
      result: 'won',
      pnl: 10,
      settlementSource: 'fixture',
    });
    const missing = bet({
      id: 'missing',
      status: 'settled',
      result: 'won',
      pnl: 10,
    });

    expect(isAuthoritativeSettlement(authoritative)).toBe(true);
    expect(isAuthoritativeSettlement(manual)).toBe(false);
    expect(isAuthoritativeSettlement(fixture)).toBe(false);
    expect(isAuthoritativeSettlement(missing)).toBe(false);

    const summary = buildPerformanceSummary({
      initialBankroll: 10000,
      bets: [authoritative, manual, fixture, missing],
    });
    expect(summary.settledCount).toBe(1);
    expect(summary.rankingStatus).toBe('hidden');
    expect(summary.tuningEligible).toBe(false);
  });

  it('documents authoritative settlement thresholds', () => {
    expect(RANKING_MIN_AUTHORITATIVE_SETTLEMENTS).toBe(10);
    expect(TUNING_MIN_AUTHORITATIVE_SETTLEMENTS).toBe(30);
  });
});
