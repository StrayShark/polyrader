import { calculateClosingLineValue, oddsToImpliedProbability } from '@polyrader/core';
import {
  FactRepository,
  MarketRepository,
  OddsSnapshotRepository,
  SimBetRepository,
} from '@polyrader/infra';

export interface ClosingPriceCaptureInput {
  closingOdds?: number;
  source?: string;
  capturedAt?: string;
  markUnavailable?: boolean;
}

export interface ClosingPriceSweepResult {
  checked: number;
  captured: number;
  pending: number;
}

/** Captures pre-result market prices and persists auditable CLV on the paper ledger. */
export class ClosingPriceService {
  private readonly bets: SimBetRepository;
  private readonly markets: MarketRepository;
  private readonly snapshots: OddsSnapshotRepository;
  private readonly facts: FactRepository;

  constructor(deps?: {
    bets?: SimBetRepository;
    markets?: MarketRepository;
    snapshots?: OddsSnapshotRepository;
    facts?: FactRepository;
  }) {
    this.bets = deps?.bets ?? new SimBetRepository();
    this.markets = deps?.markets ?? new MarketRepository();
    this.snapshots = deps?.snapshots ?? new OddsSnapshotRepository();
    this.facts = deps?.facts ?? new FactRepository();
  }

  captureForBet(betId: string, input: ClosingPriceCaptureInput = {}) {
    const withLegs = this.bets.getWithLegs(betId);
    if (!withLegs) throw new Error(`Bet ${betId} not found`);
    if (withLegs.bet.clvStatus === 'captured') return withLegs.bet;
    const capturedAt = input.capturedAt ?? new Date().toISOString();
    const boundaryAt = this.getClosingBoundaryAt(
      withLegs.bet.game,
      withLegs.bet.matchId,
      withLegs.bet.marketId,
    );
    const attempted = this.bets.recordClosingAttempt(betId, {
      attemptedAt: capturedAt,
      boundaryAt: boundaryAt?.toISOString(),
    });
    if (withLegs.legs.length !== 1) {
      return input.markUnavailable
        ? this.bets.markClvUnavailable(betId, 'MULTI_LEG_UNSUPPORTED', capturedAt)
        : attempted;
    }

    const leg = withLegs.legs[0];
    const inferred =
      input.closingOdds != null
        ? { odds: input.closingOdds, source: input.source ?? 'manual' }
        : this.inferClosingOdds(leg.matchId, leg.marketId, leg.selection);
    if (!inferred || !Number.isFinite(inferred.odds) || inferred.odds <= 1) {
      const reason = inferred ? 'INVALID_CLOSING_PRICE' : 'NO_RELIABLE_CLOSING_PRICE';
      return input.markUnavailable
        ? this.bets.markClvUnavailable(betId, reason, capturedAt)
        : attempted;
    }

    const closingProbability = oddsToImpliedProbability(inferred.odds);
    const clv = calculateClosingLineValue(withLegs.bet.totalOdds, inferred.odds);
    const latencySeconds = boundaryAt
      ? Math.max(0, (Date.parse(capturedAt) - boundaryAt.getTime()) / 1000)
      : undefined;
    this.snapshots.create({
      betId,
      matchId: leg.matchId,
      marketId: leg.marketId,
      selection: leg.selection,
      odds: inferred.odds,
      impliedProbability: closingProbability,
      source: `closing:${inferred.source}`,
    });
    return this.bets.recordClosingPrice(betId, {
      closingOdds: inferred.odds,
      closingProbability,
      closingCapturedAt: capturedAt,
      closingSource: inferred.source,
      closingBoundaryAt: boundaryAt?.toISOString(),
      closingLatencySeconds: latencySeconds,
      clv,
    });
  }

  captureOrMarkUnavailable(betId: string) {
    return this.captureForBet(betId, { markUnavailable: true });
  }

  captureDue(now = new Date(), limit = 100): ClosingPriceSweepResult {
    const candidates = this.bets.listOpenBetsPendingClv(limit);
    let checked = 0;
    let captured = 0;
    for (const bet of candidates) {
      const boundaryAt = this.getClosingBoundaryAt(bet.game, bet.matchId, bet.marketId);
      if (!boundaryAt || boundaryAt.getTime() > now.getTime()) continue;
      checked += 1;
      if (this.captureForBet(bet.id).clvStatus === 'captured') captured += 1;
    }
    return { checked, captured, pending: checked - captured };
  }

  private inferClosingOdds(matchId?: string, marketId?: string, selection?: string) {
    if (marketId && selection) {
      const market = this.markets.findByConditionId(marketId);
      if (market && market.status !== 'resolved') {
        const index = market.outcomes.findIndex(
          (outcome) => normalize(outcome) === normalize(selection),
        );
        const probability = index >= 0 ? Number(market.outcomePrices[index]) : 0;
        if (Number.isFinite(probability) && probability > 0 && probability < 1) {
          return { odds: 1 / probability, source: 'market-close' };
        }
      }
    }
    if (!matchId || !marketId || !selection) return null;
    const latest = this.snapshots
      .getByBetContext(matchId, marketId, selection)
      .find(
        (snapshot) => snapshot.source !== 'placement' && !snapshot.source.startsWith('closing:'),
      );
    return latest?.odds && latest.odds > 1 ? { odds: latest.odds, source: latest.source } : null;
  }

  private getClosingBoundaryAt(
    game: string | undefined,
    matchId: string | undefined,
    marketId: string | undefined,
  ): Date | null {
    const candidates: Date[] = [];
    if (game && matchId && ['cs2', 'lol', 'dota2', 'valorant'].includes(game)) {
      const facts = this.facts.getByGameExternalId(
        game as 'cs2' | 'lol' | 'dota2' | 'valorant',
        matchId,
      );
      const startsAt = facts ? new Date(facts.startsAt) : null;
      if (startsAt && Number.isFinite(startsAt.getTime())) candidates.push(startsAt);
    }
    const market = marketId ? this.markets.findByConditionId(marketId) : null;
    const marketEnd = market?.endDate ? new Date(market.endDate) : null;
    if (marketEnd && Number.isFinite(marketEnd.getTime())) candidates.push(marketEnd);
    if (candidates.length === 0) return null;
    return candidates.reduce((earliest, candidate) =>
      candidate.getTime() < earliest.getTime() ? candidate : earliest,
    );
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
