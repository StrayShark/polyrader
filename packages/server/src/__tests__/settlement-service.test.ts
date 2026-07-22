import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations, closeDb, MarketRepository, query } from '@polyrader/infra';
import { SettlementService } from '../services/settlement-service';
import { SimBetService } from '../services/sim-bet-service';
import { BankrollService } from '../services/bankroll-service';

const testDbPath = path.join(process.cwd(), 'data', 'settlement-service-test.db');

describe('SettlementService', () => {
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

  it('settles a winning single bet and updates account balance', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.5, matchId: 'match-1', marketId: 'market-1' }],
    });

    const settled = settlementService.settleBet(bet.id, 'won');

    expect(settled.status).toBe('settled');
    expect(settled.result).toBe('won');
    expect(settled.pnl).toBe(150); // 100 * (2.5 - 1)

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(10150);
    expect(bankroll.openExposure).toBe(0);
    expect(bankroll.account.availableBankroll).toBe(10150);
  });

  it('settles a losing single bet and updates account balance', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    const settled = settlementService.settleBet(bet.id, 'lost');

    expect(settled.status).toBe('settled');
    expect(settled.result).toBe('lost');
    expect(settled.pnl).toBe(-100);

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(9900);
    expect(bankroll.openExposure).toBe(0);
  });

  it('allows explicit pnl override', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    const settled = settlementService.settleBet(bet.id, 'won', 42);
    expect(settled.pnl).toBe(42);

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(10042);
  });

  it('throws when settling a non-open bet', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    settlementService.settleBet(bet.id, 'won');
    expect(() => settlementService.settleBet(bet.id, 'lost')).toThrow(/not open/);
  });

  it('throws when settling a non-existent bet', () => {
    const settlementService = new SettlementService();
    expect(() => settlementService.settleBet('sbet-does-not-exist', 'won')).toThrow(/not found/);
  });

  it('settles all open bets for a match by winner selection', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet: betA } = simBetService.placeBet({
      betType: 'single',
      stake: 100,
      legs: [{ selection: 'Natus Vincere', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    const { bet: betB } = simBetService.placeBet({
      betType: 'single',
      stake: 50,
      legs: [{ selection: 'FaZe Clan', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
    });

    const results = settlementService.settleMatch('match-1', 'Natus Vincere');

    expect(results).toHaveLength(2);
    const settledA = results.find((r) => r.bet.id === betA.id);
    const settledB = results.find((r) => r.bet.id === betB.id);

    expect(settledA?.bet.result).toBe('won');
    expect(settledA?.pnl).toBe(100);
    expect(settledB?.bet.result).toBe('lost');
    expect(settledB?.pnl).toBe(-50);

    const bankroll = new BankrollService().getSummary('default');
    expect(bankroll.account.currentBankroll).toBe(10050); // 10000 + 100 - 50
    expect(bankroll.openExposure).toBe(0);
  });

  it('settles a parlay as lost when any leg loses', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'parlay',
      stake: 100,
      legs: [
        { selection: 'Natus Vincere', odds: 2.0, matchId: 'match-1', marketId: 'market-1' },
        { selection: 'Team Liquid', odds: 1.8, matchId: 'match-2', marketId: 'market-2' },
      ],
    });

    const results = settlementService.settleMatch('match-1', 'FaZe Clan');

    expect(results).toHaveLength(1);
    expect(results[0].bet.id).toBe(bet.id);
    expect(results[0].bet.result).toBe('lost');
    expect(results[0].bet.status).toBe('settled');
    expect(results[0].pnl).toBe(-100);
  });

  it('leaves a parlay open until all legs are resolved', () => {
    const simBetService = new SimBetService();
    const settlementService = new SettlementService();

    const { bet } = simBetService.placeBet({
      betType: 'parlay',
      stake: 100,
      legs: [
        { selection: 'Natus Vincere', odds: 2.0, matchId: 'match-1', marketId: 'market-1' },
        { selection: 'Team Liquid', odds: 1.8, matchId: 'match-2', marketId: 'market-2' },
      ],
    });

    const firstResults = settlementService.settleMatch('match-1', 'Natus Vincere');
    expect(firstResults).toHaveLength(0);

    const betAfterFirst = simBetService.getBet(bet.id);
    expect(betAfterFirst?.bet.status).toBe('open');

    const secondResults = settlementService.settleMatch('match-2', 'Team Liquid');
    expect(secondResults).toHaveLength(1);
    expect(secondResults[0].bet.result).toBe('won');
    expect(secondResults[0].pnl).toBe(100 * (2.0 * 1.8 - 1));
  });

  it('strict auto settlement resolves only the series winner market', () => {
    const marketRepo = new MarketRepository();
    const baseMarket = {
      conditionId: 'series-market', canonicalMatchId: 'hltv:1', slug: 'series-market',
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - Test Event', description: '',
      outcomes: ['ENCE', 'SPARTA'], outcomePrices: ['0.5', '0.5'], volume: 0, volume24h: 0,
      liquidity: 0, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3600000).toISOString(),
      status: 'active' as const, tags: ['local-sim'],
    };
    marketRepo.upsert(baseMarket);
    marketRepo.upsert({
      ...baseMarket,
      conditionId: 'map-market',
      slug: 'map-market',
      question: 'Counter-Strike: ENCE vs SPARTA - Map 1 Winner',
    });
    const bets = new SimBetService();
    const series = bets.placeBet({ betType: 'single', stake: 50, legs: [{ matchId: 'match-1', marketId: 'series-market', selection: 'SPARTA', odds: 2 }] });
    const map = bets.placeBet({ betType: 'single', stake: 50, legs: [{ matchId: 'match-1', marketId: 'map-market', selection: 'SPARTA', odds: 2 }] });

    const results = new SettlementService().settleMatch('match-1', 'SPARTA', { strictMarketWinner: true });

    expect(results.map((result) => result.bet.id)).toEqual([series.bet.id]);
    expect(bets.getBet(map.bet.id)?.bet.status).toBe('open');
  });

  it('settles matching open bets across practice accounts', () => {
    query(`INSERT INTO sim_accounts (id, name) VALUES ('alternate', 'Alternate')`);
    const bets = new SimBetService();
    const alternate = bets.placeBet({
      accountId: 'alternate', betType: 'single', stake: 50,
      legs: [{ matchId: 'match-1', marketId: 'market-1', selection: 'SPARTA', odds: 2 }],
    });

    const results = new SettlementService().settleMatch('match-1', 'SPARTA');

    expect(results.map((result) => result.bet.id)).toContain(alternate.bet.id);
    expect(new BankrollService().getSummary('alternate').account.currentBankroll).toBe(10050);
  });

  it('settles map-winner legs only when structured map results are present', () => {
    const marketRepo = new MarketRepository();
    marketRepo.upsert({
      conditionId: 'series-market', canonicalMatchId: 'hltv:1', slug: 'series',
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - Event', description: '',
      outcomes: ['ENCE', 'SPARTA'], outcomePrices: ['0.45', '0.55'], volume: 0, volume24h: 0,
      liquidity: 0, startDate: '2026-07-14T08:00:00Z', endDate: '2026-07-14T12:00:00Z',
      status: 'active', tags: ['local-sim'],
    });
    marketRepo.upsert({
      conditionId: 'map-2-market', canonicalMatchId: 'hltv:1', slug: 'map-2',
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - Event - Map 2 Winner', description: '',
      outcomes: ['ENCE', 'SPARTA'], outcomePrices: ['0.5', '0.5'], volume: 0, volume24h: 0,
      liquidity: 0, startDate: '2026-07-14T08:00:00Z', endDate: '2026-07-14T12:00:00Z',
      status: 'active', tags: ['local-sim', 'map-winner'],
    });
    const bets = new SimBetService();
    const series = bets.placeBet({
      betType: 'single', stake: 50,
      legs: [{ matchId: 'match-1', marketId: 'series-market', selection: 'SPARTA', odds: 2 }],
    });
    const map = bets.placeBet({
      betType: 'single', stake: 40,
      legs: [{ matchId: 'match-1', marketId: 'map-2-market', selection: 'SPARTA', odds: 1.9 }],
    });

    const results = new SettlementService().settleStructuredMatch('match-1', {
      winnerTeamName: 'SPARTA',
      teamAName: 'ENCE',
      teamBName: 'SPARTA',
      teamAMapsWon: 1,
      teamBMapsWon: 2,
      maps: [
        { mapNumber: 1, winnerTeamName: 'ENCE' },
        { mapNumber: 2, winnerTeamName: 'SPARTA' },
        { mapNumber: 3, winnerTeamName: 'SPARTA' },
      ],
    });

    expect(results.map((result) => result.bet.id).sort()).toEqual([map.bet.id, series.bet.id].sort());
    expect(bets.getBet(series.bet.id)?.bet).toMatchObject({ status: 'settled', result: 'won' });
    expect(bets.getBet(map.bet.id)?.bet).toMatchObject({ status: 'settled', result: 'won' });
  });

  it('voids a cancelled single and removes a cancelled parlay leg from effective odds', () => {
    const bets = new SimBetService();
    const single = bets.placeBet({
      betType: 'single', stake: 50,
      legs: [{ matchId: 'cancelled', marketId: 'm1', selection: 'ENCE', odds: 2 }],
    });
    const parlay = bets.placeBet({
      betType: 'parlay', stake: 50,
      legs: [
        { matchId: 'cancelled', marketId: 'm1', selection: 'ENCE', odds: 2 },
        { matchId: 'played', marketId: 'm2', selection: 'SPARTA', odds: 1.8 },
      ],
    });
    const settlement = new SettlementService();

    const voided = settlement.voidMatch('cancelled');
    expect(voided.map((result) => result.bet.id)).toEqual([single.bet.id]);
    expect(voided[0].bet.status).toBe('voided');
    expect(bets.getBet(parlay.bet.id)?.bet.status).toBe('open');

    const completed = settlement.settleMatch('played', 'SPARTA');
    expect(completed[0].bet.result).toBe('won');
    expect(completed[0].pnl).toBeCloseTo(50 * (1.8 - 1));
  });
});
