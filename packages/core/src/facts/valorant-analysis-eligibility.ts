import type { PaperPolicyProfile } from '../analysis/types';
import type { MarketAlignmentResult } from '../markets/identity';
import type { NormalizedMatchFacts, RiotGameDataQuality } from './types';
import {
  evaluateRiotGameEligibility,
  readRiotQuality,
  type LolAnalysisEligibility,
  type LolAnalysisMode,
} from './lol-analysis-eligibility';

export type ValorantAnalysisMode = LolAnalysisMode;

export interface ValorantAnalysisEligibility
  extends Omit<LolAnalysisEligibility, 'contractVersion'> {
  contractVersion: 'valorant-analysis-eligibility.v1';
}

export function evaluateValorantAnalysisEligibility(input: {
  facts: NormalizedMatchFacts;
  marketAlignment?: MarketAlignmentResult | null;
  selectedMarketId?: string;
  policy: Pick<
    PaperPolicyProfile,
    'minimumCompleteness' | 'maximumFreshnessSeconds' | 'lowLiquidityThresholdUsd'
  >;
  now?: Date;
}): ValorantAnalysisEligibility {
  const result = evaluateRiotGameEligibility({
    ...input,
    contractVersion: 'valorant-analysis-eligibility.v1',
    readQuality: readValorantQuality,
  });
  return {
    ...result,
    contractVersion: 'valorant-analysis-eligibility.v1',
  };
}

export function readValorantQuality(
  facts: NormalizedMatchFacts,
): RiotGameDataQuality | undefined {
  return readRiotQuality(facts, 'valorant-quality.v1');
}
