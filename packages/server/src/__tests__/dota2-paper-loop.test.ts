import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closeDb, FactRepository, MarketRepository, runMigrations } from '@polyrader/infra';
import { buildDota2FixtureFacts } from '@polyrader/core';
import { AnalysisRunService } from '../services/analysis-run-service';
import { Dota2MatchReconciliationService } from '../services/dota2-match-reconciliation-service';
import { LocalPracticeMarketService } from '../services/local-practice-market-service';
import { PerformanceService } from '../services/performance-service';

const testDbPath = path.join(process.cwd(), 'data', 'dota2-paper-loop-test.db');

describe('Dota 2 facts -> paper bet -> authoritative settlement -> performance', () => {
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

  it('settles the first complete OpenDota practice loop exactly once', async () => {
    const now = new Date();
    const facts = buildDota2FixtureFacts(now);
    new FactRepository().upsertNormalizedMatch(facts);
    const market = new LocalPracticeMarketService().ensureForFacts(facts);
    expect(market?.conditionId).toBe('local-dota2-8906069414');
    expect(market?.liquidity).toBe(0);

    const run = new AnalysisRunService().runFixturePipeline({
      game: 'dota2',
      nonce: 'settle1',
      now,
    });
    expect(run.linkedBet?.status).toBe('open');

    const getMatchDetails = vi.fn().mockResolvedValue({
      matchId: '8906069414',
      duration: 2_420,
      startTime: now.toISOString(),
      radiantTeamId: 'liquid',
      radiantTeamName: 'Team Liquid',
      direTeamId: 'falcons',
      direTeamName: 'Team Falcons',
      radiantWin: true,
      patchId: 60,
      picksBans: [],
      players: [],
    });
    const service = new Dota2MatchReconciliationService({
      openDota: { getMatchDetails },
      grid: { getSeriesState: vi.fn() },
    });

    const first = await service.reconcileMatch(facts.externalMatchId);
    expect(first).toMatchObject({
      source: 'opendota',
      status: 'settled',
      winnerTeamName: 'Team Liquid',
      settledBets: 1,
      resolvedMarkets: 1,
    });

    const detail = new AnalysisRunService().getDetail(run.run.runId);
    expect(detail?.linkedBet?.status).toBe('settled');
    expect(detail?.linkedBet?.result).toBe('won');
    expect(new MarketRepository().findByConditionId(market!.conditionId)?.status).toBe('resolved');

    const performance = new PerformanceService().getSummary();
    expect(performance.settledCount).toBe(1);
    expect(performance.wins).toBe(1);
    expect(performance.winRate).toBe(1);
    expect(performance.avgBrier).toBeTypeOf('number');
    expect(performance.totalPnl).toBeGreaterThan(0);
    expect(performance.roi).toBeGreaterThan(0);
    expect(performance.clvSampleCount).toBeGreaterThanOrEqual(1);
    expect(performance.avgClv).toBeTypeOf('number');
    expect(performance.byGame.some((row) => row.key === 'dota2')).toBe(true);
    expect(detail?.linkedBet?.clvStatus).toBe('captured');

    const repeated = await service.reconcileMatch(facts.externalMatchId);
    expect(repeated.settledBets).toBe(0);
    expect(repeated.resolvedMarkets).toBe(0);
    expect(getMatchDetails).toHaveBeenCalledTimes(2);
  });

  it('creates independent winner, handicap and total markets for a Dota series', () => {
    const facts = buildDota2FixtureFacts(new Date());
    facts.format = 'BO3';
    const winner = new LocalPracticeMarketService().ensureForFacts(facts);
    const markets = new MarketRepository().findByCanonicalMatchId('dota2:8906069414');

    expect(winner?.conditionId).toBe('local-dota2-8906069414');
    expect(markets).toHaveLength(3);
    expect(markets.map((market) => market.conditionId)).toEqual(
      expect.arrayContaining([
        'local-dota2-8906069414',
        'local-dota2-8906069414-handicap',
        'local-dota2-8906069414-total-maps',
      ]),
    );
    expect(markets.every((market) => market.tags.includes('local-sim'))).toBe(true);
    expect(markets.every((market) => market.liquidity === 0)).toBe(true);
  });
});
