import type { SimBet, SimBetLeg, SimBetResult } from '@polyrader/core';
import {
  parsePolymarketMatch,
  settleLegAgainstStructuredResult,
  type StructuredMatchResult,
  type StructuredLegResult,
} from '@polyrader/core';
import { SimBetRepository, SimAccountRepository, MarketRepository } from '@polyrader/infra';
import { ReviewService } from './review-service';
import { ClosingPriceService } from './closing-price-service';

export interface SettledLeg {
  leg: SimBetLeg;
  result: SimBetResult;
}

export interface SettlementResult {
  bet: SimBet;
  legs: SettledLeg[];
  pnl: number;
}

/**
 * SettlementService — settles user practice bets (`sim_bets`) and keeps the
 * virtual account balance/exposure in sync.
 *
 * Extended market adapters (map winner / handicap / total / correct score)
 * only settle when structured result data is available; otherwise legs stay pending.
 */
export class SettlementService {
  private betRepo = new SimBetRepository();
  private accountRepo = new SimAccountRepository();
  private marketRepo = new MarketRepository();
  private reviewService = new ReviewService();
  private closingPrices = new ClosingPriceService();

  settleBet(id: string, result: SimBetResult, pnl?: number, settlementSource?: string): SimBet {
    const withLegs = this.betRepo.getWithLegs(id);
    if (!withLegs) throw new Error(`Bet ${id} not found`);
    if (withLegs.bet.status !== 'open') throw new Error(`Bet ${id} is not open`);

    this.closingPrices.captureOrMarkUnavailable(id);

    const finalPnl = this.calculatePnl(withLegs.bet, result, pnl);
    const settledBet = this.betRepo.settle(id, result, finalPnl, settlementSource);
    this.recalculateAccount(settledBet.accountId);
    this.recordSettlementMetrics(settledBet);
    return settledBet;
  }

  /**
   * Legacy helper: treat every open leg on the match as a series-winner selection.
   * Prefer `settleStructuredMatch` for multi-market settlement.
   */
  settleMatch(
    matchId: string,
    winnerSelection: string,
    options: { strictMarketWinner?: boolean } = {},
  ): SettlementResult[] {
    const structured: StructuredMatchResult = { winnerTeamName: winnerSelection };
    if (options.strictMarketWinner) {
      return this.settleStructuredMatch(matchId, structured, { kinds: ['match_winner'] });
    }
    return this.settleStructuredMatch(matchId, structured);
  }

  /**
   * Settle open legs for a match using structured map/series results and per-market adapters.
   */
  settleStructuredMatch(
    matchId: string,
    structured: StructuredMatchResult,
    options: {
      kinds?: Array<'match_winner' | 'map_winner' | 'handicap' | 'total_maps' | 'correct_score'>;
      settlementSource?: string;
    } = {},
  ): SettlementResult[] {
    const openBets = this.betRepo.getOpenBetsWithLegsForMatch(matchId);
    const results: SettlementResult[] = [];
    const allowed = options.kinds ? new Set(options.kinds) : null;

    for (const withLegs of openBets) {
      let changed = false;
      for (const leg of withLegs.legs) {
        if (leg.matchId !== matchId || leg.result) continue;
        const market = leg.marketId ? this.marketRepo.findByConditionId(leg.marketId) : null;
        const decision = settleLegAgainstStructuredResult({
          selection: leg.selection,
          marketQuestion: market?.question,
          result: structured,
        });

        if (allowed && decision.kind !== 'unsupported' && !allowed.has(decision.kind)) {
          continue;
        }

        // Back-compat: legs without market metadata still settle as series winner when provided.
        let legResult: StructuredLegResult = decision.result;
        if (decision.kind === 'unsupported' && structured.winnerTeamName) {
          const won =
            normalizeSelection(leg.selection) === normalizeSelection(structured.winnerTeamName);
          legResult = won ? 'won' : 'lost';
        }

        if (legResult === 'pending') continue;
        this.betRepo.settleLeg(leg.id, legResult);
        changed = true;
      }
      if (!changed) continue;
      this.closingPrices.captureOrMarkUnavailable(withLegs.bet.id);
      const result = this.finalizeResolvedBet(withLegs.bet.id, options.settlementSource);
      if (result) results.push(result);
    }

    return results;
  }

  voidMatch(matchId: string): SettlementResult[] {
    const results: SettlementResult[] = [];
    for (const withLegs of this.betRepo.getOpenBetsWithLegsForMatch(matchId)) {
      let changed = false;
      for (const leg of withLegs.legs) {
        if (leg.matchId !== matchId || leg.result) continue;
        this.betRepo.settleLeg(leg.id, 'push');
        changed = true;
      }
      if (!changed) continue;
      this.closingPrices.captureOrMarkUnavailable(withLegs.bet.id);
      const result = this.finalizeResolvedBet(withLegs.bet.id);
      if (result) results.push(result);
    }
    return results;
  }

  recalculateAccount(accountId: string): void {
    const account = this.accountRepo.getById(accountId);
    if (!account) return;

    const settledPnl = this.betRepo
      .getByAccount(accountId)
      .reduce((sum, bet) => sum + (bet.status === 'settled' ? bet.pnl : 0), 0);

    const currentBankroll = account.initialBankroll + settledPnl;
    const openExposure = this.betRepo.getOpenBetsTotalExposure(accountId);

    this.accountRepo.updateBankroll(
      accountId,
      currentBankroll,
      currentBankroll - openExposure,
      openExposure,
    );
  }

  private calculatePnl(bet: SimBet, result: SimBetResult, overridePnl?: number): number {
    if (overridePnl !== undefined && Number.isFinite(overridePnl)) {
      return overridePnl;
    }
    if (result === 'won') return bet.stake * (bet.totalOdds - 1);
    if (result === 'lost') return -bet.stake;
    return 0;
  }

  private finalizeResolvedBet(betId: string, settlementSource?: string): SettlementResult | null {
    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs || withLegs.bet.status !== 'open') return null;
    const settledLegs = withLegs.legs.map((leg) => ({ leg, result: leg.result ?? null }));
    const anyLost = settledLegs.some(({ result }) => result === 'lost');
    const allResolved = settledLegs.every(
      ({ result }) => result === 'won' || result === 'lost' || result === 'push',
    );
    if (!anyLost && !allResolved) return null;

    let bet: SimBet;
    if (anyLost) {
      bet = this.settleBet(betId, 'lost', undefined, settlementSource);
    } else {
      const wonLegs = withLegs.legs.filter((leg) => leg.result === 'won');
      if (wonLegs.length === 0) {
        bet = this.betRepo.void(betId);
        this.recalculateAccount(bet.accountId);
      } else {
        const effectiveOdds = wonLegs.reduce((product, leg) => product * leg.odds, 1);
        bet = this.settleBet(
          betId,
          'won',
          withLegs.bet.stake * (effectiveOdds - 1),
          settlementSource,
        );
      }
    }
    return { bet, legs: settledLegs, pnl: bet.pnl };
  }

  private recordSettlementMetrics(bet: SimBet): void {
    if (bet.result !== 'won' && bet.result !== 'lost') return;
    if (bet.modelProbability == null && bet.userProbability == null) return;
    try {
      this.reviewService.createOrUpdate({
        betId: bet.id,
        note: bet.runId ? `auto metrics from ${bet.runId}` : 'auto settlement metrics',
      });
    } catch {
      // Metrics must not block settlement.
    }
  }
}

function normalizeSelection(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isSeriesWinnerMarketQuestion(question: string): boolean {
  const parsed = parsePolymarketMatch(question);
  if (!parsed || parsed.isMapMarket) return false;
  return !/\b(handicap|spread|total|rounds?|correct\s+score|scoreline|pistol|map\s*\d+)\b/i.test(
    question,
  );
}
