import { describe, expect, it } from 'vitest';
import { buildDota2FixtureFacts } from './dota2-adapter';
import { evaluateDotaAnalysisEligibility } from './dota2-analysis-eligibility';
import type { MarketAlignmentResult } from '../markets/identity';

const policy = {
  minimumCompleteness: 0.7,
  maximumFreshnessSeconds: 3_600,
  lowLiquidityThresholdUsd: 1_000,
};

describe('Dota analysis eligibility', () => {
  it('allows a complete future fixture in synthetic practice mode', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const result = evaluateDotaAnalysisEligibility({
      facts: buildDota2FixtureFacts(now),
      marketAlignment: alignment('synthetic', 0),
      policy,
      now,
    });

    expect(result).toMatchObject({
      contractVersion: 'dota-analysis-eligibility.v1',
      analysisEligible: true,
      paperOrderEligible: true,
      mode: 'synthetic_practice',
      reasonCodes: [],
    });
  });

  it('blocks before provider execution when one required team field is missing', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildDota2FixtureFacts(now);
    const quality = facts.facts.find((fact) => fact.factId === 'dota-data-quality')!;
    const value = quality.value as {
      sides: Array<{ fields: Array<{ field: string; status: string }> }>;
    };
    value.sides[1]!.fields.find((field) => field.field === 'hero_pool')!.status = 'missing';

    const result = evaluateDotaAnalysisEligibility({
      facts,
      marketAlignment: alignment('real', 5_000),
      policy,
      now,
    });

    expect(result.analysisEligible).toBe(false);
    expect(result.mode).toBe('blocked');
    expect(result.reasonCodes).toContain('TEAM_B_HERO_POOL_MISSING');
  });

  it('allows analysis but prevents an order for a low-liquidity real market', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const result = evaluateDotaAnalysisEligibility({
      facts: buildDota2FixtureFacts(now),
      marketAlignment: alignment('real', 999),
      policy,
      now,
    });

    expect(result.analysisEligible).toBe(true);
    expect(result.paperOrderEligible).toBe(false);
    expect(result.mode).toBe('observe_only');
    expect(result.reasonCodes).toEqual(['LOW_LIQUIDITY_OBSERVE_ONLY']);
  });
});

function alignment(evidenceType: 'real' | 'synthetic', liquidityUsd: number): MarketAlignmentResult {
  return {
    aligned: true,
    status: 'aligned',
    detail: 'aligned',
    evidenceType,
    realMarketCount: evidenceType === 'real' ? 1 : 0,
    syntheticMarketCount: evidenceType === 'synthetic' ? 1 : 0,
    lowLiquidityMarketIds: evidenceType === 'real' && liquidityUsd < 1_000 ? ['market-1'] : [],
    markets: [
      {
        marketId: 'market-1',
        matchId: '8906069414',
        game: 'dota2',
        kind: 'match_winner',
        line: null,
        outcomes: [
          { outcomeId: 'liquid', label: 'Team Liquid' },
          { outcomeId: 'falcons', label: 'Team Falcons' },
        ],
        settlementRuleId: 'dota2.match_winner.v1',
        settlementSupported: true,
        liquidityUsd,
        liquidityStatus:
          evidenceType === 'synthetic'
            ? 'synthetic'
            : liquidityUsd < 1_000
              ? 'low'
              : 'normal',
        evidenceType,
        warnings: liquidityUsd < 1_000 && evidenceType === 'real' ? ['low_liquidity'] : [],
      },
    ],
  };
}
