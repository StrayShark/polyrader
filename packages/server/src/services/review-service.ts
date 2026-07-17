import type { BetReview, SimBet, ReviewDetail } from '@polyrader/core';
import { BetReviewRepository, SimBetRepository, OddsSnapshotRepository, LLMRepository } from '@polyrader/infra';
import { calculateBrierScore, calculateClosingLineValue } from '@polyrader/core';

export interface CreateReviewInput {
  betId: string;
  errorTags?: string[];
  note?: string;
  closingOdds?: number;
}

export class ReviewService {
  private reviewRepo = new BetReviewRepository();
  private betRepo = new SimBetRepository();
  private snapshotRepo = new OddsSnapshotRepository();
  private llmRepo = new LLMRepository();

  getReview(betId: string): BetReview | undefined {
    return this.reviewRepo.getByBetId(betId);
  }

  private computeMetrics(bet: SimBet, closingOdds?: number): { brierScore?: number; closingLineValue?: number; roi?: number } {
    let brierScore: number | undefined;
    if (bet.userProbability !== undefined && bet.result && bet.result !== 'push') {
      const outcome = bet.result === 'won' ? 1 : 0;
      brierScore = calculateBrierScore(bet.userProbability, outcome);
    }

    let closingLineValue: number | undefined;
    if (closingOdds && bet.totalOdds > 0) {
      closingLineValue = calculateClosingLineValue(bet.totalOdds, closingOdds);
    }

    const roi = bet.stake > 0 ? bet.pnl / bet.stake : undefined;

    return { brierScore, closingLineValue, roi };
  }

  createOrUpdate(input: CreateReviewInput): BetReview {
    const withLegs = this.betRepo.getWithLegs(input.betId);
    if (!withLegs) throw new Error(`Bet ${input.betId} not found`);

    const { bet } = withLegs;
    const closingOdds = input.closingOdds ?? this.inferClosingOdds(input.betId);
    const { brierScore, closingLineValue } = this.computeMetrics(bet, closingOdds);

    const existing = this.reviewRepo.getByBetId(input.betId);
    if (existing) {
      return this.reviewRepo.update(input.betId, {
        errorTags: input.errorTags,
        note: input.note,
        brierScore,
        closingLineValue,
      });
    }

    return this.reviewRepo.create({
      betId: input.betId,
      errorTags: input.errorTags,
      note: input.note,
      brierScore,
      closingLineValue,
    });
  }

  private inferClosingOdds(betId: string): number | undefined {
    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs || withLegs.legs.length === 0) return undefined;

    // For single-leg bets, use the latest snapshot odds as closing line.
    // For parlays, closing line is more complex; fallback to undefined.
    if (withLegs.legs.length !== 1) return undefined;
    const leg = withLegs.legs[0];
    const snapshots = this.snapshotRepo.getByBetContext(leg.matchId, leg.marketId, leg.selection);
    const latest = snapshots.length > 0
      ? snapshots.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0]
      : undefined;
    return latest?.odds;
  }

  getReviewDetail(betId: string): ReviewDetail | undefined {
    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs) return undefined;

    const { bet, legs } = withLegs;
    const snapshots = legs
      .map((leg) => ({
        leg,
        items: this.snapshotRepo.getByBetContext(leg.matchId, leg.marketId, leg.selection),
      }))
      .flatMap(({ leg, items }) =>
        items.map((s) => ({ ...s, legSelection: leg.selection })),
      );

    const closingOdds = this.inferClosingOdds(betId);
    const review = this.reviewRepo.getByBetId(betId);
    const metrics = this.computeMetrics(bet, closingOdds);
    const match = bet.matchId ? this.llmRepo.getMatch(bet.matchId) : null;
    const matchName = match
      ? `${match.team_a_name ?? ''} vs ${match.team_b_name ?? ''}${match.event_name ? ` · ${match.event_name}` : ''}`.trim()
      : undefined;

    return {
      bet,
      review,
      snapshots,
      matchName,
      closingOdds,
      brierScore: review?.brierScore ?? metrics.brierScore,
      closingLineValue: review?.closingLineValue ?? metrics.closingLineValue,
      roi: review?.roi ?? metrics.roi,
    };
  }

  listSettledForReview(accountId: string): ReviewDetail[] {
    const settled = this.betRepo.getByAccount(accountId, 'settled');
    return settled
      .map((bet) => this.getReviewDetail(bet.id))
      .filter((d): d is ReviewDetail => d !== undefined);
  }

  getSnapshotsForBet(betId: string) {
    const detail = this.getReviewDetail(betId);
    return detail?.snapshots ?? [];
  }
}
