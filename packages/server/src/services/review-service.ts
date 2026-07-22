import type {
  BetReview,
  ReviewDetail,
  ReviewListFilters,
  ReviewSummary,
  ReviewErrorTagStat,
  ReviewDimensionStat,
  SimBet,
} from '@polyrader/core';
import {
  BetReviewRepository,
  SimBetRepository,
  OddsSnapshotRepository,
  LLMRepository,
  Cs2MatchSnapshotRepository,
} from '@polyrader/infra';
import {
  calculateBrierScore,
  calculateClosingLineValue,
  buildReviewSuggestions,
} from '@polyrader/core';

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
  private matchSnapshotRepo = new Cs2MatchSnapshotRepository();
  private llmRepo = new LLMRepository();

  getReview(betId: string): BetReview | undefined {
    return this.reviewRepo.getByBetId(betId);
  }

  private computeMetrics(bet: SimBet, closingOdds?: number): {
    brierScore?: number;
    closingLineValue?: number;
    roi?: number;
  } {
    let brierScore: number | undefined;
    const probability = bet.modelProbability ?? bet.userProbability;
    if (probability !== undefined && bet.result && bet.result !== 'push') {
      const outcome = bet.result === 'won' ? 1 : 0;
      brierScore = calculateBrierScore(probability, outcome);
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
        closingOdds,
      });
    }

    return this.reviewRepo.create({
      betId: input.betId,
      errorTags: input.errorTags,
      note: input.note,
      brierScore,
      closingLineValue,
      closingOdds,
    });
  }

  private getPlacementOdds(betId: string, bet: SimBet): number | undefined {
    const linked = this.snapshotRepo.getByBetId(betId).filter((s) => s.source === 'placement');
    if (linked.length === 1) return linked[0].odds;
    if (linked.length > 1) {
      return linked.reduce((product, snap) => product * Math.max(1.01, snap.odds), 1);
    }
    return bet.totalOdds > 0 ? bet.totalOdds : undefined;
  }

  private inferClosingOdds(betId: string): number | undefined {
    const review = this.reviewRepo.getByBetId(betId);
    if (review?.closingOdds && review.closingOdds > 1) return review.closingOdds;

    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs || withLegs.legs.length === 0) return undefined;
    if (withLegs.legs.length !== 1) return undefined;

    const leg = withLegs.legs[0];
    const snapshots = this.snapshotRepo.getByBetContext(leg.matchId, leg.marketId, leg.selection)
      .filter((s) => s.source !== 'placement' || s.betId !== betId);
    const latest = snapshots.length > 0
      ? snapshots.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0]
      : undefined;
    return latest?.odds;
  }

  getReviewDetail(betId: string): ReviewDetail | undefined {
    const withLegs = this.betRepo.getWithLegs(betId);
    if (!withLegs) return undefined;

    const { bet, legs } = withLegs;
    const linkedSnapshots = this.snapshotRepo.getByBetId(betId);
    const contextSnapshots = legs
      .map((leg) => this.snapshotRepo.getByBetContext(leg.matchId, leg.marketId, leg.selection))
      .flat();
    const byId = new Map<string, (typeof linkedSnapshots)[number]>();
    for (const snap of [...linkedSnapshots, ...contextSnapshots]) {
      byId.set(snap.id, snap);
    }
    const snapshots = Array.from(byId.values()).sort((a, b) => (
      a.capturedAt < b.capturedAt ? -1 : 1
    ));

    const placementOdds = this.getPlacementOdds(betId, bet);
    const review = this.reviewRepo.getByBetId(betId);
    const closingOdds = review?.closingOdds ?? this.inferClosingOdds(betId);
    const metrics = this.computeMetrics(bet, closingOdds);
    const matchSnapshot = this.matchSnapshotRepo.getByBetId(betId);
    const match = bet.matchId ? this.llmRepo.getMatch(bet.matchId) : null;
    const matchName = matchSnapshot
      ? `${matchSnapshot.teamAName ?? ''} vs ${matchSnapshot.teamBName ?? ''}${matchSnapshot.eventName ? ` · ${matchSnapshot.eventName}` : ''}`.trim()
      : match
        ? `${match.team_a_name ?? ''} vs ${match.team_b_name ?? ''}${match.event_name ? ` · ${match.event_name}` : ''}`.trim()
        : undefined;

    return {
      bet,
      review,
      snapshots,
      placementOdds,
      matchName,
      matchSnapshot,
      closingOdds,
      brierScore: review?.brierScore ?? metrics.brierScore,
      closingLineValue: review?.closingLineValue ?? metrics.closingLineValue,
      roi: review?.roi ?? metrics.roi,
    };
  }

  private matchesFilters(detail: ReviewDetail, filters: ReviewListFilters = {}): boolean {
    const { bet, review, matchSnapshot } = detail;
    const result = filters.result ?? 'all';
    const betType = filters.betType ?? 'all';
    const format = filters.format ?? 'all';
    const timing = filters.timing ?? 'all';
    const hasNote = filters.hasNote ?? 'all';
    const tags = filters.tags ?? [];

    if (result !== 'all' && bet.result !== result) return false;
    if (betType !== 'all' && bet.betType !== betType) return false;
    if (format !== 'all' && bet.matchFormat !== format) return false;

    if (filters.tier && filters.tier !== 'all') {
      const tier = (bet.matchTier ?? matchSnapshot?.tier ?? '').toUpperCase();
      if (tier !== filters.tier.toUpperCase()) return false;
    }

    if (timing !== 'all') {
      const status = (matchSnapshot?.status ?? '').toLowerCase();
      const isLive = status === 'live' || status === 'ongoing';
      if (timing === 'live' && !isLive) return false;
      if (timing === 'pre' && isLive) return false;
    }

    if (filters.fromDate) {
      const from = new Date(filters.fromDate);
      if (!Number.isNaN(from.getTime()) && new Date(bet.placedAt) < from) return false;
    }
    if (filters.toDate) {
      const to = new Date(filters.toDate);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        if (new Date(bet.placedAt) > to) return false;
      }
    }

    if (hasNote !== 'all') {
      const notePresent = Boolean(review?.note);
      if (hasNote === 'yes' && !notePresent) return false;
      if (hasNote === 'no' && notePresent) return false;
    }

    if (tags.length > 0) {
      const reviewTags = review?.errorTags ?? [];
      if (!tags.some((tag) => reviewTags.includes(tag))) return false;
    }

    return true;
  }

  listSettledForReview(accountId: string, filters: ReviewListFilters = {}): ReviewDetail[] {
    const settled = this.betRepo.getByAccount(accountId, 'settled');
    return settled
      .map((bet) => this.getReviewDetail(bet.id))
      .filter((d): d is ReviewDetail => d !== undefined)
      .filter((d) => this.matchesFilters(d, filters));
  }

  getSummary(accountId: string, filters: ReviewListFilters = {}): ReviewSummary {
    const details = this.listSettledForReview(accountId, filters);
    const totalSettled = details.length;
    const wins = details.filter((d) => d.bet.result === 'won').length;
    const winRate = totalSettled > 0 ? wins / totalSettled : 0;
    const totalPnl = details.reduce((sum, d) => sum + d.bet.pnl, 0);

    const briers = details.map((d) => d.brierScore).filter((v): v is number => v !== undefined);
    const clvs = details.map((d) => d.closingLineValue).filter((v): v is number => v !== undefined);
    const rois = details.map((d) => d.roi).filter((v): v is number => v !== undefined);
    const avgBrier = briers.length > 0 ? briers.reduce((a, b) => a + b, 0) / briers.length : undefined;
    const avgClv = clvs.length > 0 ? clvs.reduce((a, b) => a + b, 0) / clvs.length : undefined;
    const avgRoi = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : undefined;

    let maxDrawdown = 0;
    let peak = 0;
    let equity = 0;
    for (const detail of [...details].sort((a, b) => (
      (a.bet.settledAt ?? a.bet.placedAt) < (b.bet.settledAt ?? b.bet.placedAt) ? -1 : 1
    ))) {
      equity += detail.bet.pnl;
      if (equity > peak) peak = equity;
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }

    const tagMap = new Map<string, { count: number; totalPnl: number; briers: number[] }>();
    for (const detail of details) {
      for (const tag of detail.review?.errorTags ?? []) {
        const current = tagMap.get(tag) ?? { count: 0, totalPnl: 0, briers: [] };
        current.count += 1;
        current.totalPnl += detail.bet.pnl;
        if (detail.brierScore !== undefined) current.briers.push(detail.brierScore);
        tagMap.set(tag, current);
      }
    }
    const errorTagStats: ReviewErrorTagStat[] = Array.from(tagMap.entries())
      .map(([tag, value]) => ({
        tag,
        count: value.count,
        totalPnl: value.totalPnl,
        avgBrier: value.briers.length > 0
          ? value.briers.reduce((a, b) => a + b, 0) / value.briers.length
          : undefined,
      }))
      .sort((a, b) => b.count - a.count || a.totalPnl - b.totalPnl);

    const byFormat = this.groupDimension(details, (d) => d.bet.matchFormat ?? 'unknown');
    const byTier = this.groupDimension(details, (d) => d.bet.matchTier ?? d.matchSnapshot?.tier ?? 'unknown');

    return {
      totalSettled,
      winRate,
      totalPnl,
      avgBrier,
      avgClv,
      avgRoi,
      maxDrawdown,
      errorTagStats,
      byFormat,
      byTier,
      suggestions: buildReviewSuggestions({
        errorTagStats,
        avgBrier,
        avgClv,
        winRate,
        totalSettled,
      }),
    };
  }

  private groupDimension(
    details: ReviewDetail[],
    keyFn: (detail: ReviewDetail) => string,
  ): ReviewDimensionStat[] {
    const map = new Map<string, { count: number; wins: number; totalPnl: number; briers: number[] }>();
    for (const detail of details) {
      const key = keyFn(detail) || 'unknown';
      const current = map.get(key) ?? { count: 0, wins: 0, totalPnl: 0, briers: [] };
      current.count += 1;
      if (detail.bet.result === 'won') current.wins += 1;
      current.totalPnl += detail.bet.pnl;
      if (detail.brierScore !== undefined) current.briers.push(detail.brierScore);
      map.set(key, current);
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({
        key,
        count: value.count,
        winRate: value.count > 0 ? value.wins / value.count : 0,
        totalPnl: value.totalPnl,
        avgBrier: value.briers.length > 0
          ? value.briers.reduce((a, b) => a + b, 0) / value.briers.length
          : undefined,
      }))
      .sort((a, b) => b.count - a.count);
  }

  getSnapshotsForBet(betId: string) {
    const detail = this.getReviewDetail(betId);
    return detail?.snapshots ?? [];
  }
}
