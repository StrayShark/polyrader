import type { ReviewSuggestion } from '../types/index';

export const REVIEW_ERROR_TAGS = [
  'overrated_favorite',
  'ignored_map_pool',
  'chased_odds',
  'overtrusted_ai',
  'oversized_position',
  'missing_late_info',
] as const;

export type ReviewErrorTag = (typeof REVIEW_ERROR_TAGS)[number];

export interface ReviewSuggestionInput {
  errorTagStats: Array<{ tag: string; count: number; totalPnl: number }>;
  avgBrier?: number;
  avgClv?: number;
  winRate?: number;
  totalSettled: number;
}

export type { ReviewSuggestion };

/**
 * Rule-based training / review suggestions. Never outputs real-money bet advice.
 */
export function buildReviewSuggestions(input: ReviewSuggestionInput): ReviewSuggestion[] {
  const suggestions: ReviewSuggestion[] = [];
  const { errorTagStats, avgBrier, avgClv, winRate, totalSettled } = input;

  if (totalSettled < 5) {
    suggestions.push({
      id: 'need_more_samples',
      severity: 'info',
      messageKey: 'review.suggestion_needMoreSamples',
      params: { count: totalSettled },
    });
  }

  if (avgBrier !== undefined && avgBrier > 0.25 && totalSettled >= 5) {
    suggestions.push({
      id: 'calibration',
      severity: 'warning',
      messageKey: 'review.suggestion_calibration',
      params: { brier: Number(avgBrier.toFixed(3)) },
    });
  }

  if (avgClv !== undefined && avgClv < -0.02 && totalSettled >= 5) {
    suggestions.push({
      id: 'negative_clv',
      severity: 'warning',
      messageKey: 'review.suggestion_negativeClv',
      params: { clv: Number((avgClv * 100).toFixed(1)) },
    });
  }

  if (winRate !== undefined && winRate < 0.4 && totalSettled >= 8) {
    suggestions.push({
      id: 'low_win_rate',
      severity: 'warning',
      messageKey: 'review.suggestion_lowWinRate',
      params: { winRate: Number((winRate * 100).toFixed(0)) },
    });
  }

  const tagAdvice: Record<string, { severity: ReviewSuggestion['severity']; messageKey: string }> = {
    overrated_favorite: { severity: 'warning', messageKey: 'review.suggestion_overratedFavorite' },
    ignored_map_pool: { severity: 'warning', messageKey: 'review.suggestion_ignoredMapPool' },
    chased_odds: { severity: 'critical', messageKey: 'review.suggestion_chasedOdds' },
    overtrusted_ai: { severity: 'warning', messageKey: 'review.suggestion_overtrustedAi' },
    oversized_position: { severity: 'critical', messageKey: 'review.suggestion_oversizedPosition' },
    missing_late_info: { severity: 'info', messageKey: 'review.suggestion_missingLateInfo' },
  };

  for (const stat of errorTagStats) {
    if (stat.count < 2) continue;
    const advice = tagAdvice[stat.tag];
    if (!advice) continue;
    suggestions.push({
      id: `tag_${stat.tag}`,
      severity: advice.severity,
      messageKey: advice.messageKey,
      params: { count: stat.count, pnl: Number(stat.totalPnl.toFixed(2)) },
    });
  }

  if (suggestions.length === 0 && totalSettled >= 5) {
    suggestions.push({
      id: 'keep_journaling',
      severity: 'info',
      messageKey: 'review.suggestion_keepJournaling',
    });
  }

  return suggestions.slice(0, 6);
}
