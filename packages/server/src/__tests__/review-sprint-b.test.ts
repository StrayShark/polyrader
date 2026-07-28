import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, runMigrations, SimAccountRepository, SimBetRepository } from '@polyrader/infra';
import { ReviewService } from '../services/review-service';
import { SimBetService } from '../services/sim-bet-service';
import { BankrollService } from '../services/bankroll-service';

const testDbPath = path.join(process.cwd(), 'data', 'review-sprint-b-test.db');

describe('Sprint B review loop', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
    new SimAccountRepository().getDefault();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('stores placement odds, match snapshot, closing odds, and summary stats', () => {
    const betService = new SimBetService();
    const reviewService = new ReviewService();
    const bankroll = new BankrollService();

    const placed = betService.placeBet({
      betType: 'single',
      stake: 50,
      matchId: 'match-sprint-b',
      marketId: 'market-1',
      matchFormat: 'BO3',
      matchTier: 'A',
      userProbability: 0.62,
      marketProbability: 0.55,
      legs: [{
        matchId: 'match-sprint-b',
        marketId: 'market-1',
        selection: 'Team A',
        odds: 1.8,
        source: 'test',
      }],
      reasoning: 'map pool edge',
    });

    const betRepo = new SimBetRepository();
    betRepo.settle(placed.bet.id, 'lost', -50);

    const review = reviewService.createOrUpdate({
      betId: placed.bet.id,
      errorTags: ['ignored_map_pool', 'chased_odds'],
      note: 'Should have waited for better line',
      closingOdds: 2.1,
    });

    const detail = reviewService.getReviewDetail(placed.bet.id);
    expect(detail?.placementOdds).toBeCloseTo(1.8, 5);
    expect(detail?.closingOdds).toBeCloseTo(2.1, 5);
    expect(detail?.matchSnapshot?.betId).toBe(placed.bet.id);
    expect(detail?.matchSnapshot?.format).toBe('BO3');
    expect(review.closingOdds).toBeCloseTo(2.1, 5);
    expect(review.closingLineValue).toBeDefined();

    const summary = reviewService.getSummary('default');
    expect(summary.totalSettled).toBe(1);
    expect(summary.errorTagStats.map((s) => s.tag).sort()).toEqual(['chased_odds', 'ignored_map_pool']);
    expect(summary.errorTagTrend.map((s) => s.tag).sort()).toEqual(['chased_odds', 'ignored_map_pool']);
    expect(summary.errorTagTrend[0]?.periodLabel).toMatch(/^\d{2}\/\d{2}-\d{2}\/\d{2}$/);
    expect(summary.byFormat.some((row) => row.key === 'BO3')).toBe(true);
    expect(summary.suggestions.length).toBeGreaterThan(0);

    const filtered = reviewService.listSettledForReview('default', {
      format: 'BO3',
      tags: ['chased_odds'],
    });
    expect(filtered).toHaveLength(1);

    const bankrollSummary = bankroll.getSummary('default');
    expect(bankrollSummary.voidedBets).toEqual([]);
    expect(Array.isArray(bankrollSummary.voidedBets)).toBe(true);
  });

  it('exposes voided bets on bankroll summary', () => {
    const betService = new SimBetService();
    const betRepo = new SimBetRepository();
    const bankroll = new BankrollService();

    const placed = betService.placeBet({
      betType: 'single',
      stake: 25,
      matchId: 'match-void',
      marketId: 'market-void',
      legs: [{
        matchId: 'match-void',
        marketId: 'market-void',
        selection: 'Team B',
        odds: 2.0,
      }],
    });

    betRepo.void(placed.bet.id);
    const summary = bankroll.getSummary('default');
    expect(summary.voidedBets.map((b) => b.id)).toEqual([placed.bet.id]);
    expect(summary.voidedBets[0].status).toBe('voided');
  });
});
