import type { PaperPolicyProfile } from '../analysis/types';
import type { CanonicalMarketIdentity, MarketAlignmentResult } from '../markets/identity';
import type { DotaDataQuality, NormalizedMatchFacts } from './types';

export type DotaAnalysisMode =
  | 'real_market'
  | 'synthetic_practice'
  | 'observe_only'
  | 'blocked';

export interface DotaAnalysisEligibility {
  contractVersion: 'dota-analysis-eligibility.v1';
  analysisEligible: boolean;
  paperOrderEligible: boolean;
  mode: DotaAnalysisMode;
  reasonCodes: string[];
  selectedMarket?: CanonicalMarketIdentity;
  quality?: DotaDataQuality;
  checkedAt: string;
}

const PREMATCH_STATUSES = new Set([
  'scheduled',
  'upcoming',
  'pre_match',
  'prematch',
  'not_started',
]);

/** Shared Dota gate used by board summaries, provider execution, and paper-order policy. */
export function evaluateDotaAnalysisEligibility(input: {
  facts: NormalizedMatchFacts;
  marketAlignment?: MarketAlignmentResult | null;
  selectedMarketId?: string;
  policy: Pick<
    PaperPolicyProfile,
    'minimumCompleteness' | 'maximumFreshnessSeconds' | 'lowLiquidityThresholdUsd'
  >;
  now?: Date;
}): DotaAnalysisEligibility {
  const now = input.now ?? new Date();
  const quality = readDotaQuality(input.facts);
  const selectedMarket = selectMarket(input.marketAlignment, input.selectedMarketId);
  const reasonCodes: string[] = [];

  if (!isCurrentPrematch(input.facts, now)) reasonCodes.push('MATCH_NOT_PREMATCH');
  if (input.facts.completeness < input.policy.minimumCompleteness) {
    reasonCodes.push('INPUT_INCOMPLETE');
  }
  if (
    !Number.isFinite(input.facts.freshnessSeconds) ||
    input.facts.freshnessSeconds > input.policy.maximumFreshnessSeconds
  ) {
    reasonCodes.push('INPUT_STALE');
  }
  if (input.facts.conflictFlags.length > 0) reasonCodes.push('FACT_CONFLICT');

  if (!quality) {
    reasonCodes.push('DOTA_QUALITY_MISSING');
  } else {
    for (const side of quality.sides) {
      for (const field of side.fields) {
        if (field.status === 'available') continue;
        reasonCodes.push(
          `${side.side === 'a' ? 'TEAM_A' : 'TEAM_B'}_${fieldReason(field.field, field.status)}`,
        );
      }
    }
    if (quality.match.patch.status !== 'available') {
      reasonCodes.push(`MATCH_${fieldReason('patch', quality.match.patch.status)}`);
    }
  }

  if (!selectedMarket) {
    reasonCodes.push('MARKET_NOT_ALIGNED');
  } else if (!selectedMarket.settlementSupported) {
    reasonCodes.push('MARKET_UNSUPPORTED');
  }

  const blockingReasons = [...new Set(reasonCodes)];
  const analysisEligible = blockingReasons.length === 0;
  if (!analysisEligible || !selectedMarket) {
    return {
      contractVersion: 'dota-analysis-eligibility.v1',
      analysisEligible: false,
      paperOrderEligible: false,
      mode: 'blocked',
      reasonCodes: blockingReasons,
      selectedMarket,
      quality,
      checkedAt: now.toISOString(),
    };
  }

  const observeOnly =
    selectedMarket.evidenceType === 'real' &&
    (selectedMarket.liquidityUsd == null ||
      selectedMarket.liquidityUsd < input.policy.lowLiquidityThresholdUsd);
  return {
    contractVersion: 'dota-analysis-eligibility.v1',
    analysisEligible: true,
    paperOrderEligible: !observeOnly,
    mode: observeOnly
      ? 'observe_only'
      : selectedMarket.evidenceType === 'synthetic'
        ? 'synthetic_practice'
        : 'real_market',
    reasonCodes: observeOnly ? ['LOW_LIQUIDITY_OBSERVE_ONLY'] : [],
    selectedMarket,
    quality,
    checkedAt: now.toISOString(),
  };
}

export function readDotaQuality(facts: NormalizedMatchFacts): DotaDataQuality | undefined {
  const value = facts.facts.find((fact) => fact.factId === 'dota-data-quality')?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const quality = value as Partial<DotaDataQuality>;
  return quality.contractVersion === 'dota-quality.v1' && Array.isArray(quality.sides)
    ? (quality as DotaDataQuality)
    : undefined;
}

function selectMarket(
  alignment: MarketAlignmentResult | null | undefined,
  selectedMarketId: string | undefined,
): CanonicalMarketIdentity | undefined {
  if (!alignment) return undefined;
  const supported = alignment.markets.filter((market) => market.settlementSupported);
  if (selectedMarketId) {
    return supported.find((market) => market.marketId === selectedMarketId);
  }
  return [...supported].sort((a, b) => {
    const evidence = Number(b.evidenceType === 'real') - Number(a.evidenceType === 'real');
    const liquidity = (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1);
    const winner = Number(b.kind === 'match_winner') - Number(a.kind === 'match_winner');
    return evidence || liquidity || winner;
  })[0];
}

function isCurrentPrematch(facts: NormalizedMatchFacts, now: Date): boolean {
  const startsAt = Date.parse(facts.startsAt);
  return (
    PREMATCH_STATUSES.has(facts.status.toLowerCase()) &&
    Number.isFinite(startsAt) &&
    startsAt >= now.getTime() - 15 * 60 * 1000
  );
}

function fieldReason(
  field: string,
  status: 'available' | 'missing' | 'stale' | 'conflict',
): string {
  return `${field.toUpperCase()}_${status.toUpperCase()}`;
}
