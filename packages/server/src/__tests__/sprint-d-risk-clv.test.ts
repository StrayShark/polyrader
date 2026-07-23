import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  closeDb,
  MarketRepository,
  OddsSnapshotRepository,
  PaperRiskLimitError,
  runMigrations,
  SimBetRepository,
} from '@polyrader/infra';
import { ClosingPriceService } from '../services/closing-price-service';
import { AnalysisRunService } from '../services/analysis-run-service';
import { PaperPolicyService } from '../services/paper-policy-service';
import { PerformanceService } from '../services/performance-service';
import { SimBetService } from '../services/sim-bet-service';

const testDbPath = path.join(process.cwd(), 'data', 'sprint-d-risk-clv-test.db');

describe('Sprint D paper risk and CLV', () => {
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

  it.each([
    {
      name: 'total open exposure',
      field: 'maxOpenExposure' as const,
      expectedCode: 'TOTAL_OPEN_EXPOSURE_LIMIT',
      first: context('cs2', 'provider-a', 'match_winner', 'match-1'),
      second: context('lol', 'provider-b', 'handicap', 'match-2'),
    },
    {
      name: 'game exposure',
      field: 'maxGameExposure' as const,
      expectedCode: 'GAME_OPEN_EXPOSURE_LIMIT',
      first: context('cs2', 'provider-a', 'match_winner', 'match-1'),
      second: context('cs2', 'provider-b', 'handicap', 'match-2'),
    },
    {
      name: 'provider exposure',
      field: 'maxProviderExposure' as const,
      expectedCode: 'PROVIDER_OPEN_EXPOSURE_LIMIT',
      first: context('cs2', 'provider-a', 'match_winner', 'match-1'),
      second: context('lol', 'provider-a', 'handicap', 'match-2'),
    },
    {
      name: 'market-kind exposure',
      field: 'maxMarketKindExposure' as const,
      expectedCode: 'MARKET_KIND_OPEN_EXPOSURE_LIMIT',
      first: context('cs2', 'provider-a', 'match_winner', 'match-1'),
      second: context('lol', 'provider-b', 'match_winner', 'match-2'),
    },
  ])('rejects $name atomically', ({ field, expectedCode, first, second }) => {
    activatePolicy({ [field]: 30 });
    const service = new SimBetService();
    service.placeBet(betInput(first));

    let failure: unknown;
    try {
      service.placeBet(betInput(second));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(PaperRiskLimitError);
    expect((failure as PaperRiskLimitError).code).toBe(expectedCode);
    expect(new SimBetRepository().getAllBets('default')).toHaveLength(1);
    expect(new PaperPolicyService().getRiskState().exposure.openExposure).toBe(20);
  });

  it('counts settled orders toward the daily stake limit', () => {
    activatePolicy({ maxDailyStake: 30 });
    const service = new SimBetService();
    const first = service.placeBet(
      betInput(context('cs2', 'provider-a', 'match_winner', 'match-1')),
    );
    service.settleBet(first.bet.id, 'won');

    expect(() =>
      service.placeBet(betInput(context('lol', 'provider-b', 'handicap', 'match-2'))),
    ).toThrow(/max daily stake/);
    const risk = new PaperPolicyService().getRiskState();
    expect(risk.exposure.dailyStake).toBe(20);
    expect(risk.exposure.openExposure).toBe(0);
  });

  it('turns an analysis paper decision into an explicit runtime risk rejection', () => {
    activatePolicy({ maxOpenExposure: 0 });
    const run = new AnalysisRunService().runFixturePipeline({
      game: 'cs2',
      nonce: 'sprint-d-risk-reject',
      now: new Date(),
    });

    expect(run.decision?.action).toBe('rejected');
    expect(run.decision?.reasonCodes).toContain('TOTAL_OPEN_EXPOSURE_LIMIT');
    expect(run.linkedBet).toBeNull();
    expect(
      run.events.some(
        (event) =>
          event.stage === 'paper_order' && event.detail.includes('TOTAL_OPEN_EXPOSURE_LIMIT'),
      ),
    ).toBe(true);
  });

  it('captures a closing market price, persists CLV, and exposes coverage in performance', () => {
    new MarketRepository().upsert({
      conditionId: 'market-clv',
      slug: 'market-clv',
      question: 'CS2: Team A vs Team B',
      description: 'Sprint D closing price fixture',
      outcomes: ['Team A', 'Team B'],
      outcomePrices: ['0.5555556', '0.4444444'],
      volume: 1000,
      volume24h: 500,
      liquidity: 250,
      endDate: new Date(Date.now() + 60_000).toISOString(),
      startDate: new Date().toISOString(),
      status: 'active',
      tags: ['local-sim'],
    });
    const service = new SimBetService();
    const placed = service.placeBet({
      ...betInput(context('cs2', 'provider-a', 'match_winner', 'match-clv')),
      marketId: 'market-clv',
      legs: [
        {
          selection: 'Team A',
          odds: 2,
          matchId: 'match-clv',
          marketId: 'market-clv',
          source: 'provider-a',
        },
      ],
    });

    const captured = new ClosingPriceService().captureForBet(placed.bet.id);
    expect(captured.clvStatus).toBe('captured');
    expect(captured.closingOdds).toBeCloseTo(1.8, 3);
    expect(captured.clv).toBeCloseTo(0.1111, 3);
    expect(captured.closingAttemptCount).toBe(1);
    expect(
      new OddsSnapshotRepository()
        .getByBetId(placed.bet.id)
        .some((snapshot) => snapshot.source === 'closing:market-close'),
    ).toBe(true);

    service.settleBet(placed.bet.id, 'won', undefined, 'hltv');
    const performance = new PerformanceService().getSummary();
    expect(performance.avgClv).toBeCloseTo(0.1111, 3);
    expect(performance.clvSampleCount).toBe(1);
    expect(performance.clvMissingCount).toBe(0);
    expect(performance.byGame[0]?.avgClv).toBeCloseTo(0.1111, 3);
  });

  it('marks CLV unavailable instead of fabricating a closing price', () => {
    const service = new SimBetService();
    const placed = service.placeBet(
      betInput(context('valorant', 'provider-a', 'match_winner', 'missing-market')),
    );
    const settled = service.settleBet(placed.bet.id, 'lost', undefined, 'grid');
    expect(settled.clvStatus).toBe('unavailable');
    expect(settled.clv).toBeUndefined();
    expect(settled.closingAttemptCount).toBe(1);
    expect(settled.clvUnavailableReason).toBe('NO_RELIABLE_CLOSING_PRICE');

    const performance = new PerformanceService().getSummary();
    expect(performance.avgClv).toBeUndefined();
    expect(performance.clvSampleCount).toBe(0);
    expect(performance.clvMissingCount).toBe(1);
  });
});

function activatePolicy(overrides: Record<string, number>) {
  return new PaperPolicyService().upsert({
    name: 'sprint-d-test',
    isActive: true,
    policy: {
      maxSingleStake: 1000,
      maxDailyStake: 1000,
      maxOpenExposure: 1000,
      maxGameExposure: 1000,
      maxProviderExposure: 1000,
      maxMarketKindExposure: 1000,
      ...overrides,
    },
  });
}

function context(game: string, provider: string, marketKind: string, matchId: string) {
  return { game, provider, marketKind, matchId };
}

function betInput(input: ReturnType<typeof context>) {
  return {
    betType: 'single' as const,
    stake: 20,
    game: input.game,
    provider: input.provider,
    marketKind: input.marketKind,
    matchId: input.matchId,
    marketId: `market-${input.matchId}`,
    legs: [
      {
        selection: 'Team A',
        odds: 2,
        matchId: input.matchId,
        marketId: `market-${input.matchId}`,
        source: input.provider,
      },
    ],
  };
}
