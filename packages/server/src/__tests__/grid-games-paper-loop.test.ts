import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closeDb, FactRepository, MarketRepository, runMigrations } from '@polyrader/infra';
import { buildLolFixtureFacts, buildValorantFixtureFacts } from '@polyrader/core';
import { AnalysisRunService } from '../services/analysis-run-service';
import {
  GridMatchReconciliationService,
  type GridSettlementGame,
} from '../services/grid-match-reconciliation-service';
import { LocalPracticeMarketService } from '../services/local-practice-market-service';
import { PerformanceService } from '../services/performance-service';

const testDbPath = path.join(process.cwd(), 'data', 'grid-games-paper-loop-test.db');

describe('LoL/Valorant facts -> paper bet -> GRID settlement -> performance', () => {
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

  it.each(['lol', 'valorant'] as const)(
    'settles the first complete %s practice loop exactly once',
    async (game: GridSettlementGame) => {
      const now = new Date();
      const facts = game === 'lol' ? buildLolFixtureFacts(now) : buildValorantFixtureFacts(now);
      new FactRepository().upsertNormalizedMatch(facts);
      const market = new LocalPracticeMarketService().ensureForFacts(facts);
      expect(market?.conditionId).toBe(`local-${game}-${facts.externalMatchId}`);
      expect(market?.liquidity).toBe(0);

      const run = new AnalysisRunService().runFixturePipeline({
        game,
        nonce: `${game}settle1`,
        now,
      });
      expect(run.decision?.action).toBe('paper_bet');
      expect(run.decision?.reasonCodes).toContain('LOW_LIQUIDITY_STAKE_REDUCED');
      expect(run.linkedBet).toMatchObject({ game, status: 'open' });

      const getSeriesState = vi.fn().mockResolvedValue({
        finished: true,
        teamAWon: true,
        teamAScore: 2,
        teamBScore: 0,
        players: [],
        teamPlayers: [[], []],
      });
      const service = new GridMatchReconciliationService({ grid: { getSeriesState } });

      const first = await service.reconcileMatch(game, facts.externalMatchId);
      expect(first).toMatchObject({
        game,
        source: 'grid',
        status: 'settled',
        winnerTeamName: facts.participants[0]?.name,
        settledBets: 1,
        resolvedMarkets: 1,
      });

      const detail = new AnalysisRunService().getDetail(run.run.runId);
      expect(detail?.linkedBet).toMatchObject({ status: 'settled', result: 'won' });
      expect(new MarketRepository().findByConditionId(market!.conditionId)?.status).toBe(
        'resolved',
      );

      const performance = new PerformanceService().getSummary();
      expect(performance.settledCount).toBe(1);
      expect(performance.wins).toBe(1);
      expect(performance.totalPnl).toBeGreaterThan(0);
      expect(performance.byGame.some((row) => row.key === game)).toBe(true);

      const repeated = await service.reconcileMatch(game, facts.externalMatchId);
      expect(repeated.settledBets).toBe(0);
      expect(repeated.resolvedMarkets).toBe(0);
      expect(getSeriesState).toHaveBeenCalledTimes(2);
    },
  );
});
