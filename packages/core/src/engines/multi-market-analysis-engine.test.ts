import { describe, expect, it } from 'vitest';
import type { Market } from '../types/index';
import { LOW_LIQUIDITY_THRESHOLD_USD, MultiMarketAnalysisEngine } from './multi-market-analysis-engine';

function market(overrides: Partial<Market>): Market {
  return {
    conditionId: 'market-1',
    slug: 'spirit-vs-g2',
    question: 'Counter-Strike: Spirit vs G2 (BO3)',
    description: '',
    outcomes: ['Spirit', 'G2'],
    outcomePrices: ['0.55', '0.45'],
    volume: 10_000,
    volume24h: 5_000,
    liquidity: 2_000,
    endDate: '2026-08-01T00:00:00Z',
    startDate: '2026-07-20T00:00:00Z',
    status: 'active',
    tags: ['cs2'],
    ...overrides,
  };
}

describe('MultiMarketAnalysisEngine', () => {
  const engine = new MultiMarketAnalysisEngine();

  it('derives match, handicap, and total-map probabilities from one BO3 series model', () => {
    const analyses = engine.analyze({
      markets: [
        market({ conditionId: 'winner' }),
        market({
          conditionId: 'handicap',
          question: 'Counter-Strike: Spirit vs G2 (BO3) - Spirit Handicap -1.5',
          outcomes: ['Yes', 'No'],
          outcomePrices: ['0.40', '0.60'],
        }),
        market({
          conditionId: 'total',
          question: 'Counter-Strike: Spirit vs G2 (BO3) - Total Maps Over/Under 2.5',
          outcomes: ['Over', 'Under'],
          outcomePrices: ['0.52', '0.48'],
        }),
      ],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.65,
      baseConfidence: 0.8,
    });

    expect(analyses.map((analysis) => analysis.kind)).toEqual(['match_winner', 'handicap', 'total_maps']);
    expect(analyses[0].outcomes[0].modelProbability).toBeCloseTo(0.65, 5);
    expect(analyses[1].line).toBe(-1.5);
    expect(analyses[1].outcomes[0].modelProbability).toBeGreaterThan(0);
    expect(analyses[2].line).toBe(2.5);
    expect((analyses[2].outcomes[0].modelProbability ?? 0) + (analyses[2].outcomes[1].modelProbability ?? 0)).toBeCloseTo(1, 8);
    expect(analyses[1].warnings).toContain('derived_from_series_probability');
  });

  it('normalizes market prices before calculating edge', () => {
    const [analysis] = engine.analyze({
      markets: [market({ outcomePrices: ['0.60', '0.50'] })],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.65,
    });

    expect(analysis.outcomes[0].marketProbability).toBeCloseTo(0.60 / 1.10, 8);
    expect(analysis.outcomes[0].edge).toBeCloseTo(0.65 - (0.60 / 1.10), 8);
  });

  it('marks sub-$1,000 external markets as observe-only and reduces confidence', () => {
    const [low] = engine.analyze({
      markets: [market({ liquidity: LOW_LIQUIDITY_THRESHOLD_USD - 1 })],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.65,
      baseConfidence: 0.8,
    });
    const [normal] = engine.analyze({
      markets: [market({ liquidity: LOW_LIQUIDITY_THRESHOLD_USD })],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.65,
      baseConfidence: 0.8,
    });

    expect(low.liquidityStatus).toBe('low');
    expect(low.signal).toBe('observe_only');
    expect(low.warnings).toContain('low_liquidity');
    expect(low.confidence).toBeLessThan(normal.confidence);
    expect(normal.liquidityStatus).toBe('normal');
  });

  it('does not label local simulation liquidity as external low liquidity', () => {
    const [analysis] = engine.analyze({
      markets: [market({ liquidity: 0, tags: ['cs2', 'local-sim'] })],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.6,
    });

    expect(analysis.liquidityStatus).toBe('synthetic');
    expect(analysis.warnings).not.toContain('low_liquidity');
  });

  it('does not derive total-round probabilities from a series map model', () => {
    const [analysis] = engine.analyze({
      markets: [market({
        conditionId: 'round-total',
        question: 'Counter-Strike: Spirit vs G2 (BO3) - Total Rounds Over/Under 26.5',
        outcomes: ['Over 26.5', 'Under 26.5'],
        outcomePrices: ['0.50', '0.50'],
      })],
      teamAName: 'Spirit',
      teamBName: 'G2',
      format: 'BO3',
      seriesWinProbabilityA: 0.62,
    });

    expect(analysis.kind).toBe('unsupported');
    expect(analysis.signal).toBe('model_limited');
    expect(analysis.outcomes.every((outcome) => outcome.modelProbability === null)).toBe(true);
  });
});
