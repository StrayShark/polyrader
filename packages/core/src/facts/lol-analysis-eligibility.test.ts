import { describe, expect, it } from 'vitest';
import { buildLolFixtureFacts } from './lol-adapter';
import { evaluateLolAnalysisEligibility } from './lol-analysis-eligibility';
import { buildValorantFixtureFacts } from './valorant-adapter';
import { evaluateValorantAnalysisEligibility } from './valorant-analysis-eligibility';
import type { MarketAlignmentResult } from '../markets/identity';

const policy = {
  minimumCompleteness: 0.7,
  maximumFreshnessSeconds: 3_600,
  lowLiquidityThresholdUsd: 1_000,
};

describe('LoL / Valorant analysis eligibility', () => {
  it('allows a complete LoL fixture in synthetic practice mode', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const result = evaluateLolAnalysisEligibility({
      facts: buildLolFixtureFacts(now),
      marketAlignment: alignment('lol', 'synthetic', 0),
      policy,
      now,
    });

    expect(result).toMatchObject({
      contractVersion: 'lol-analysis-eligibility.v1',
      analysisEligible: true,
      paperOrderEligible: true,
      mode: 'synthetic_practice',
      reasonCodes: [],
    });
  });

  it('blocks LoL before provider execution when one roster is missing', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildLolFixtureFacts(now);
    const quality = facts.facts.find((fact) => fact.factId === 'lol-data-quality')!;
    const value = quality.value as {
      sides: Array<{ fields: Array<{ field: string; status: string }> }>;
    };
    value.sides[0]!.fields.find((field) => field.field === 'roster')!.status = 'missing';

    const result = evaluateLolAnalysisEligibility({
      facts,
      marketAlignment: alignment('lol', 'real', 5_000),
      policy,
      now,
    });

    expect(result.analysisEligible).toBe(false);
    expect(result.mode).toBe('blocked');
    expect(result.reasonCodes).toContain('TEAM_A_ROSTER_MISSING');
  });

  it('allows Valorant analysis but prevents an order for a low-liquidity real market', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const result = evaluateValorantAnalysisEligibility({
      facts: buildValorantFixtureFacts(now),
      marketAlignment: alignment('valorant', 'real', 999),
      policy,
      now,
    });

    expect(result).toMatchObject({
      contractVersion: 'valorant-analysis-eligibility.v1',
      analysisEligible: true,
      paperOrderEligible: false,
      mode: 'observe_only',
      reasonCodes: ['LOW_LIQUIDITY_OBSERVE_ONLY'],
    });
  });
});

function alignment(
  game: 'lol' | 'valorant',
  evidenceType: 'real' | 'synthetic',
  liquidityUsd: number,
): MarketAlignmentResult {
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
        matchId: game === 'lol' ? 'lck-104' : 'vct-82',
        game,
        kind: 'match_winner',
        line: null,
        outcomes:
          game === 'lol'
            ? [
                { outcomeId: 't1', label: 'T1' },
                { outcomeId: 'hle', label: 'Hanwha Life Esports' },
              ]
            : [
                { outcomeId: 'sen', label: 'Sentinels' },
                { outcomeId: 'g2', label: 'G2 Esports' },
              ],
        settlementRuleId: `${game}.match_winner.v1`,
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
