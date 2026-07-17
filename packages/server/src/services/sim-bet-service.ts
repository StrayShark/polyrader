import type { SimBet, SimBetLeg, PlaceSimBetInput, SimBetResult } from '@polyrader/core';
import {
  SimBetRepository,
  SimAccountRepository,
  OddsSnapshotRepository,
} from '@polyrader/infra';
import { oddsToImpliedProbability, calculateEdge, calculateEv } from '@polyrader/core';
import { SettlementService } from './settlement-service';

export interface SimBetWithLegs {
  bet: SimBet;
  legs: SimBetLeg[];
}

export class SimBetService {
  private betRepo = new SimBetRepository();
  private accountRepo = new SimAccountRepository();
  private snapshotRepo = new OddsSnapshotRepository();
  private settlementService = new SettlementService();

  listBets(accountId: string, status?: 'open' | 'settled' | 'voided'): SimBet[] {
    return this.betRepo.getByAccount(accountId, status);
  }

  getBet(id: string): SimBetWithLegs | undefined {
    return this.betRepo.getWithLegs(id);
  }

  placeBet(input: PlaceSimBetInput): SimBetWithLegs {
    const account = input.accountId
      ? this.accountRepo.getById(input.accountId)
      : this.accountRepo.getDefault();

    if (!account) {
      throw new Error(`Account ${input.accountId ?? 'default'} not found`);
    }

    if (!input.legs || input.legs.length === 0) {
      throw new Error('At least one bet leg is required');
    }

    // Calculate total odds (decimal product for parlays)
    const totalOdds = input.legs.reduce((product, leg) => product * Math.max(1.01, leg.odds), 1);
    const impliedProbability = oddsToImpliedProbability(totalOdds);
    const marketProbability = input.marketProbability ?? impliedProbability;
    const userProbability = input.userProbability ?? marketProbability;
    const edge = calculateEdge(userProbability, marketProbability);
    const ev = calculateEv(input.stake, userProbability, totalOdds);

    if (input.stake > account.availableBankroll) {
      throw new Error(
        `Insufficient available bankroll: $${account.availableBankroll.toFixed(2)}`,
      );
    }

    // Risk checks
    const riskFraction = input.stake / account.currentBankroll;
    if (riskFraction > account.maxSingleRiskPct) {
      throw new Error(
        `Stake $${input.stake.toFixed(2)} exceeds max single risk ` +
          `${(account.maxSingleRiskPct * 100).toFixed(1)}% of bankroll`,
      );
    }

    const openExposure = this.betRepo.getOpenBetsTotalExposure(account.id);
    if (riskFraction + openExposure / account.currentBankroll > account.maxDailyRiskPct) {
      throw new Error(
        `This bet would exceed max daily risk ${(account.maxDailyRiskPct * 100).toFixed(1)}% ` +
          `including open exposure`,
      );
    }

    // Create bet + legs
    const { bet, legs } = this.betRepo.create({
      accountId: account.id,
      matchId: input.matchId,
      marketId: input.marketId,
      betType: input.betType,
      stake: input.stake,
      totalOdds,
      impliedProbability,
      userProbability,
      modelProbability: input.modelProbability,
      marketProbability,
      edge,
      ev,
      reasoning: input.reasoning,
      matchFormat: input.matchFormat,
      matchTier: input.matchTier,
      legs: input.legs.map((leg) => ({
        matchId: leg.matchId,
        marketId: leg.marketId,
        selection: leg.selection,
        odds: leg.odds,
        impliedProbability: oddsToImpliedProbability(leg.odds),
        source: leg.source,
      })),
    });

    // Capture odds snapshot for each leg
    for (const leg of legs) {
      this.snapshotRepo.create({
        matchId: leg.matchId,
        marketId: leg.marketId,
        selection: leg.selection,
        odds: leg.odds,
        impliedProbability: leg.impliedProbability,
        source: leg.source ?? 'user',
      });
    }

    // Update account exposure
    const newOpenExposure = this.betRepo.getOpenBetsTotalExposure(account.id);
    this.accountRepo.updateBankroll(
      account.id,
      account.currentBankroll,
      account.currentBankroll - newOpenExposure,
      newOpenExposure,
    );

    return { bet, legs };
  }

  settleBet(id: string, result: SimBetResult, pnl?: number): SimBet {
    return this.settlementService.settleBet(id, result, pnl);
  }

  settleMatch(matchId: string, winnerSelection: string) {
    return this.settlementService.settleMatch(matchId, winnerSelection);
  }
}
