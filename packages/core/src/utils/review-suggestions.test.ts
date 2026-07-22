import { describe, expect, it } from 'vitest';
import { buildReviewSuggestions } from './review-suggestions';

describe('buildReviewSuggestions', () => {
  it('asks for more samples when settled count is low', () => {
    const suggestions = buildReviewSuggestions({
      totalSettled: 2,
      errorTagStats: [],
    });
    expect(suggestions.some((s) => s.id === 'need_more_samples')).toBe(true);
  });

  it('surfaces repeated error tags as training suggestions', () => {
    const suggestions = buildReviewSuggestions({
      totalSettled: 12,
      winRate: 0.5,
      avgBrier: 0.18,
      avgClv: 0.01,
      errorTagStats: [
        { tag: 'chased_odds', count: 3, totalPnl: -120 },
        { tag: 'ignored_map_pool', count: 2, totalPnl: -40 },
      ],
    });
    expect(suggestions.find((s) => s.id === 'tag_chased_odds')?.severity).toBe('critical');
    expect(suggestions.some((s) => s.id === 'tag_ignored_map_pool')).toBe(true);
  });

  it('never invents real-money betting advice keys', () => {
    const suggestions = buildReviewSuggestions({
      totalSettled: 20,
      winRate: 0.3,
      avgBrier: 0.3,
      avgClv: -0.05,
      errorTagStats: [],
    });
    for (const suggestion of suggestions) {
      expect(suggestion.messageKey.startsWith('review.suggestion_')).toBe(true);
      expect(suggestion.messageKey.toLowerCase()).not.toContain('bet_now');
    }
  });
});
