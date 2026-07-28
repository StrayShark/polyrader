import { describe, expect, it } from 'vitest';
import {
  hasDisplayableTwoWayPrices,
  isLobbyVisibleMatch,
  isPrematchAnalysisEligible,
} from '../utils/match-eligibility';

describe('isPrematchAnalysisEligible', () => {
  const now = Date.parse('2026-07-23T03:00:00.000Z');

  it('accepts a current scheduled match', () => {
    expect(isPrematchAnalysisEligible('scheduled', '2026-07-23T04:00:00.000Z', now)).toBe(true);
  });

  it('rejects finished and stale historical samples', () => {
    expect(isPrematchAnalysisEligible('finished', '2026-07-22T04:00:00.000Z', now)).toBe(false);
    expect(isPrematchAnalysisEligible('scheduled', '2026-07-22T04:00:00.000Z', now)).toBe(false);
  });
});

describe('isLobbyVisibleMatch', () => {
  const now = Date.parse('2026-07-23T03:00:00.000Z');

  it('keeps live matches and hides stale scheduled ones', () => {
    expect(isLobbyVisibleMatch('live', '2026-07-23T01:00:00.000Z', now)).toBe(true);
    expect(isLobbyVisibleMatch('scheduled', '2026-07-23T02:30:00.000Z', now)).toBe(false);
    expect(isLobbyVisibleMatch('scheduled', '2026-07-23T02:50:00.000Z', now)).toBe(true);
  });
});

describe('hasDisplayableTwoWayPrices', () => {
  it('accepts open two-way prices', () => {
    expect(hasDisplayableTwoWayPrices(['0.65', '0.35'])).toBe(true);
  });

  it('rejects resolved-looking boundary and extreme prices', () => {
    expect(hasDisplayableTwoWayPrices(['0.005', '0.995'])).toBe(false);
    expect(hasDisplayableTwoWayPrices(['0.0005', '0.9995'])).toBe(false);
  });

  it('rejects missing or malformed prices', () => {
    expect(hasDisplayableTwoWayPrices(['0.65'])).toBe(false);
    expect(hasDisplayableTwoWayPrices(['not-a-price', '0.35'])).toBe(false);
  });
});
