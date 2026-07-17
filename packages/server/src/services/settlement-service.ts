import type { SimBet, SimBetLeg, SimBetResult } from '@polyrader/core';
import { parsePolymarketMatch } from '@polyrader/core';
import { SimBetRepository, SimAccountRepository, MarketRepository } from '@polyrader/infra';

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
 * This service is intentionally separate from the old LLM-provider
 * SettlementEngine, which still handles legacy `simulated_bets` records.
 */
export class SettlementService {
  private betRepo = new SimBetRepository();
  private accountRepo = new SimAccountRepository();
  private marketRepo = new MarketRepository();

  /**
   * Settle a single bet by ID.
   *
   * For a single leg the caller supplies the result directly. For parlays the
   * caller may instead use `settleMatch` which resolves each leg independently.
   */
  settleBet(id: string, result: SimBetResult, pnl?: number): SimBet {
    const withLegs = this.betRepo.getWithLegs(id);
    if (!withLegs) throw new Error(`Bet ${id} not found`);
    if (withLegs.bet.status !== 'open') throw new Error(`Bet ${id} is not open`);

    const finalPnl = this.calculatePnl(withLegs.bet, result, pnl);
    const settledBet = this.betRepo.settle(id, result, finalPnl);

    this.recalculateAccount(settledBet.accountId);

    return settledBet;
  }

  /**
   * Settle all open bets that touch a given match.
   *
   * Each leg whose `matchId` equals `matchId` is resolved to `won` when its
   * selection matches `winnerSelection`; otherwise `lost`. A parlay only wins
   * when every leg wins.
   */
  settleMatch(matchId: string, winnerSelection: string, options: { strictMarketWinner?: boolean } = {}): SettlementResult[] {
    const openBets = this.betRepo.getOpenBetsWithLegsForMatch(matchId);
    const results: SettlementResult[] = [];

    for (const withLegs of openBets) {
      let changed = false;
      for (const leg of withLegs.legs) {
        if (leg.matchId !== matchId || leg.result) continue;
        if (options.strictMarketWinner && !this.isSeriesWinnerLeg(leg)) continue;
        const won = normalizeSelection(leg.selection) === normalizeSelection(winnerSelection);
        const result = won ? 'won' : ('lost' as SimBetResult);
        this.betRepo.settleLeg(leg.id, result);
        changed = true;
      }
      if (!changed) continue;
      const result = this.finalizeResolvedBet(withLegs.bet.id);
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
      const result = this.finalizeResolvedBet(withLegs.bet.id);
      if (result) results.push(result);
    }
    return results;
  }

  /**
   * Recalculate a virtual account's available balance and open exposure after
   * a settlement.
   */
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

    if (result === 'won') {
      return bet.stake * (bet.totalOdds - 1);
    }
    if (result === 'lost') {
      return -bet.stake;
    }
    return 0;
  }

  private finalizeResolvedBet(betId: string): SettlementResult | null {
    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs || withLegs.bet.status !== 'open') return null;
    const settledLegs = withLegs.legs.map((leg) => ({ leg, result: leg.result ?? null }));
    const anyLost = settledLegs.some(({ result }) => result === 'lost');
    const allResolved = settledLegs.every(({ result }) => result === 'won' || result === 'lost' || result === 'push');
    if (!anyLost && !allResolved) return null;

    let bet: SimBet;
    if (anyLost) {
      bet = this.settleBet(betId, 'lost');
    } else {
      const wonLegs = withLegs.legs.filter((leg) => leg.result === 'won');
      if (wonLegs.length === 0) {
        bet = this.betRepo.void(betId);
        this.recalculateAccount(bet.accountId);
      } else {
        const effectiveOdds = wonLegs.reduce((product, leg) => product * leg.odds, 1);
        bet = this.settleBet(betId, 'won', withLegs.bet.stake * (effectiveOdds - 1));
      }
    }
    return { bet, legs: settledLegs, pnl: bet.pnl };
  }

  private isSeriesWinnerLeg(leg: SimBetLeg): boolean {
    if (!leg.marketId) return false;
    const market = this.marketRepo.findByConditionId(leg.marketId);
    if (!market || market.outcomes.length !== 2) return false;
    const parsed = parsePolymarketMatch(market.question);
    if (!parsed || parsed.isMapMarket) return false;
    return !/\b(handicap|spread|total|rounds?|correct\s+score|scoreline|pistol|map\s*\d+)\b/i.test(market.question);
  }
}

function normalizeSelection(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
