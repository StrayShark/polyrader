import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  closeDb,
  runMigrations,
  LLMRepository,
  MarketRepository,
  EsportsRepository,
  SimBetRepository,
} from '@polyrader/infra';
import { SimBetService } from '../services/sim-bet-service';
import { MatchReconciliationService } from '../services/match-reconciliation-service';

const testDbPath = path.join(process.cwd(), 'data', 'match-reconciliation-test.db');

describe('MatchReconciliationService', () => {
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

  it('persists an HLTV result, resolves local odds and settles the user practice bet', async () => {
    const llmRepo = new LLMRepository();
    const marketRepo = new MarketRepository();
    const esportsRepo = new EsportsRepository();
    llmRepo.upsertMatch({
      matchId: 'local-hltv-2395534', canonicalMatchId: 'hltv:2395534', hltvMatchId: '2395534',
      teamAId: '4869', teamBId: '13214', teamAName: 'ENCE', teamBName: 'SPARTA',
      eventName: 'European Pro League', eventType: 'Online', format: 'BO3',
      scheduledAt: '2026-07-14T08:00:00Z', status: 'live', maps: [], hasTeamData: false,
    });
    esportsRepo.upsertMatchSourceLink({
      matchId: 'local-hltv-2395534', source: 'hltv', sourceId: '2395534',
      sourceUrl: 'https://www.hltv.org/matches/2395534/example', confidence: 1,
    });
    marketRepo.upsert({
      conditionId: 'local-hltv-2395534', canonicalMatchId: 'hltv:2395534', slug: 'local-hltv-2395534',
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - European Pro League', description: '',
      outcomes: ['ENCE', 'SPARTA'], outcomePrices: ['0.45', '0.55'], volume: 0, volume24h: 0,
      liquidity: 0, startDate: '2026-07-14T08:00:00Z', endDate: '2026-07-14T12:00:00Z',
      status: 'active', tags: ['local-sim'],
    });
    const placed = new SimBetService().placeBet({
      betType: 'single', stake: 100,
      legs: [{ matchId: 'local-hltv-2395534', marketId: 'local-hltv-2395534', selection: 'SPARTA', odds: 2 }],
    });

    const service = new MatchReconciliationService({
      llmRepo, marketRepo, esportsRepo,
      hltv: {
        getMatchOutcome: async () => ({
          matchId: '2395534', available: true, status: 'finished', teamAId: '4869', teamBId: '13214',
          teamAName: 'ENCE', teamBName: 'SPARTA', teamAScore: 0, teamBScore: 2,
          winnerTeamId: '13214', winnerTeamName: 'SPARTA', url: '',
        }),
      },
    });

    const result = await service.reconcileMatch('local-hltv-2395534');

    expect(result).toMatchObject({ status: 'finished', winnerTeamName: 'SPARTA', settledBets: 1, resolvedMarkets: 1 });
    expect(llmRepo.getMatch('local-hltv-2395534')).toMatchObject({ status: 'finished', winner_id: '13214' });
    expect(marketRepo.findByConditionId('local-hltv-2395534')).toMatchObject({ status: 'resolved', resolvedOutcome: 'SPARTA' });
    expect(new SimBetRepository().getById(placed.bet.id)).toMatchObject({ status: 'settled', result: 'won', pnl: 100 });
  });
});
