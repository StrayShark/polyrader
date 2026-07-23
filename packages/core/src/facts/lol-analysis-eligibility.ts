import type { PaperPolicyProfile } from '../analysis/types';
import type { CanonicalMarketIdentity, MarketAlignmentResult } from '../markets/identity';
import type { NormalizedMatchFacts, RiotGameDataQuality } from './types';

export type LolAnalysisMode = 'real_market' | 'synthetic_practice' | 'observe_only' | 'blocked';

export interface LolAnalysisEligibility {
  contractVersion: 'lol-analysis-eligibility.v1';
  analysisEligible: boolean;
  paperOrderEligible: boolean;
  mode: LolAnalysisMode;
  reasonCodes: string[];
  selectedMarket?: CanonicalMarketIdentity;
  quality?: RiotGameDataQuality;
  checkedAt: string;
}

const PREMATCH_STATUSES = new Set([
  'scheduled',
  'upcoming',
  'pre_match',
  'prematch',
  'not_started',
]);

export function evaluateLolAnalysisEligibility(input: {
  facts: NormalizedMatchFacts;
  marketAlignment?: MarketAlignmentResult | null;
  selectedMarketId?: string;
  policy: Pick<
    PaperPolicyProfile,
    'minimumCompleteness' | 'maximumFreshnessSeconds' | 'lowLiquidityThresholdUsd'
  >;
  now?: Date;
}): LolAnalysisEligibility {
  const result = evaluateRiotGameEligibility({
    ...input,
    contractVersion: 'lol-analysis-eligibility.v1',
    readQuality: readLolQuality,
  });
  return {
    ...result,
    contractVersion: 'lol-analysis-eligibility.v1',
  };
}

export function readLolQuality(facts: NormalizedMatchFacts): RiotGameDataQuality | undefined {
  return readRiotQuality(facts, 'lol-quality.v1');
}

export function evaluateRiotGameEligibility(input: {
  facts: NormalizedMatchFacts;
  marketAlignment?: MarketAlignmentResult | null;
  selectedMarketId?: string;
  policy: Pick<
    PaperPolicyProfile,
    'minimumCompleteness' | 'maximumFreshnessSeconds' | 'lowLiquidityThresholdUsd'
  >;
  now?: Date;
  contractVersion: 'lol-analysis-eligibility.v1' | 'valorant-analysis-eligibility.v1';
  readQuality: (facts: NormalizedMatchFacts) => RiotGameDataQuality | undefined;
}): Omit<LolAnalysisEligibility, 'contractVersion'> & {
  contractVersion: 'lol-analysis-eligibility.v1' | 'valorant-analysis-eligibility.v1';
} {
  const now = input.now ?? new Date();
  const quality = input.readQuality(input.facts);
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
    reasonCodes.push('RIOT_QUALITY_MISSING');
  } else {
    for (const side of quality.sides) {
      for (const field of side.fields) {
        if (field.status === 'available') continue;
        reasonCodes.push(
          `${side.side === 'a' ? 'TEAM_A' : 'TEAM_B'}_${field.field.toUpperCase()}_${field.status.toUpperCase()}`,
        );
      }
    }
    const matchField = quality.match.patch ?? quality.match.mapPool;
    if (matchField && matchField.status !== 'available') {
      reasonCodes.push(`MATCH_${matchField.field.toUpperCase()}_${matchField.status.toUpperCase()}`);
    }
  }

  if (!selectedMarket) {
    reasonCodes.push('MARKET_NOT_ALIGNED');
  } else if (!selectedMarket.settlementSupported) {
    reasonCodes.push('MARKET_UNSUPPORTED');
  }

  const blockingReasons = [...new Set(reasonCodes)];
  if (blockingReasons.length > 0 || !selectedMarket) {
    return {
      contractVersion: input.contractVersion,
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
    contractVersion: input.contractVersion,
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

export function readRiotQuality(
  facts: NormalizedMatchFacts,
  contractVersion: RiotGameDataQuality['contractVersion'],
): RiotGameDataQuality | undefined {
  const factId =
    contractVersion === 'lol-quality.v1' ? 'lol-data-quality' : 'valorant-data-quality';
  const value = facts.facts.find((fact) => fact.factId === factId)?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const quality = value as Partial<RiotGameDataQuality>;
  return quality.contractVersion === contractVersion && Array.isArray(quality.sides)
    ? (quality as RiotGameDataQuality)
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
