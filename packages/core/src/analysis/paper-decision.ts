import type {
  AnalysisReport,
  AnalysisRequestEnvelope,
  AnalysisResponseV1,
  PaperDecisionResult,
  PaperPolicyProfile,
} from './types';
import { DEFAULT_PAPER_POLICY } from './types';

export interface PaperDecisionInput {
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
  reportId: string;
  policy?: Partial<PaperPolicyProfile>;
  bankroll?: number;
  settlementRulesAvailable?: boolean;
}

/**
 * Deterministic paper-order gate. The model recommendation is advisory only.
 */
export function decidePaperOrder(input: PaperDecisionInput): PaperDecisionResult {
  const policy: PaperPolicyProfile = { ...DEFAULT_PAPER_POLICY, ...input.policy };
  const reasons: string[] = [];

  if (input.envelope.dataSnapshot.completeness < policy.minimumCompleteness) {
    reasons.push('INPUT_INCOMPLETE');
  }
  if (
    !Number.isFinite(input.envelope.dataSnapshot.freshnessSeconds) ||
    input.envelope.dataSnapshot.freshnessSeconds > policy.maximumFreshnessSeconds
  ) {
    reasons.push('INPUT_STALE');
  }
  if (input.response.confidence.score < policy.minimumConfidence) {
    reasons.push('POLICY_REJECTED_CONFIDENCE');
  }
  if (policy.requireAuthoritativeSettlement && input.settlementRulesAvailable === false) {
    reasons.push('MARKET_UNALIGNED');
  }
  if (
    input.envelope.market.evidenceType === 'real' &&
    input.envelope.market.liquidityUsd < policy.lowLiquidityThresholdUsd
  ) {
    reasons.push('LOW_LIQUIDITY_OBSERVE_ONLY');
  }

  const recommended = input.response.recommendation;
  if (recommended.action === 'pass' || !recommended.outcomeId) {
    return {
      action: 'pass',
      reasonCodes: reasons.length > 0 ? reasons : ['MODEL_PASS'],
      outcomeId: null,
      modelProbability: null,
      marketProbability: null,
      edgeAtEntry: null,
      stake: 0,
      price: null,
      policyVersion: policy.policyVersion,
    };
  }

  const modelOutcome = input.response.prediction.outcomes.find(
    (item) => item.outcomeId === recommended.outcomeId,
  );
  const marketOutcome = input.envelope.market.outcomes.find(
    (item) => item.outcomeId === recommended.outcomeId,
  );
  const modelProbability = modelOutcome?.probability ?? null;
  const marketProbability = marketOutcome?.marketProbability ?? null;
  const edgeAtEntry =
    modelProbability !== null && marketProbability !== null
      ? modelProbability - marketProbability
      : null;

  if (edgeAtEntry === null || edgeAtEntry < policy.minimumEdge) {
    reasons.push('POLICY_REJECTED_EDGE');
  }

  if (reasons.length > 0) {
    return {
      action: 'rejected',
      reasonCodes: reasons,
      outcomeId: recommended.outcomeId,
      modelProbability,
      marketProbability,
      edgeAtEntry,
      stake: 0,
      price: marketProbability !== null ? 1 / Math.max(marketProbability, 0.01) : null,
      policyVersion: policy.policyVersion,
    };
  }

  let stake = policy.fixedStake;
  if (policy.stakeMode === 'no_bet') stake = 0;
  if (policy.stakeMode === 'proportional') {
    stake = Math.max(1, (input.bankroll ?? 10_000) * policy.bankrollFraction);
  }
  if (
    policy.stakeMode === 'fractional_kelly' &&
    edgeAtEntry !== null &&
    marketProbability !== null
  ) {
    const odds = 1 / Math.max(marketProbability, 0.01);
    const kelly = Math.max(0, edgeAtEntry / Math.max(odds - 1, 0.01));
    stake = Math.max(1, (input.bankroll ?? 10_000) * Math.min(kelly, policy.bankrollFraction));
  }

  if (input.envelope.market.liquidityUsd < policy.lowLiquidityThresholdUsd) {
    stake *= 0.5;
    reasons.push(
      input.envelope.market.evidenceType === 'synthetic'
        ? 'SYNTHETIC_PRACTICE'
        : 'LOW_LIQUIDITY_STAKE_REDUCED',
    );
  }
  stake = Math.min(stake, policy.maxSingleStake);

  if (stake <= 0) {
    return {
      action: 'pass',
      reasonCodes: ['NO_BET_POLICY'],
      outcomeId: recommended.outcomeId,
      modelProbability,
      marketProbability,
      edgeAtEntry,
      stake: 0,
      price: marketProbability !== null ? 1 / Math.max(marketProbability, 0.01) : null,
      policyVersion: policy.policyVersion,
    };
  }

  return {
    action: 'paper_bet',
    reasonCodes: reasons.length > 0 ? reasons : ['PAPER_ORDER_CREATED'],
    outcomeId: recommended.outcomeId,
    modelProbability,
    marketProbability,
    edgeAtEntry,
    stake: Number(stake.toFixed(2)),
    price:
      marketProbability !== null
        ? Number((1 / Math.max(marketProbability, 0.01)).toFixed(4))
        : null,
    policyVersion: policy.policyVersion,
  };
}

export function buildAnalysisReport(input: {
  reportId: string;
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
  decision: PaperDecisionResult;
  provider?: string;
  model?: string;
  repairCount?: number;
  latencyMs?: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}): AnalysisReport {
  const { envelope, response, decision } = input;
  return {
    id: input.reportId,
    runId: envelope.runId,
    game: envelope.game,
    matchId: envelope.match.matchId,
    marketId: envelope.market.marketId,
    marketKind: envelope.market.kind,
    marketContext: {
      line: envelope.market.line,
      evidenceType: envelope.market.evidenceType ?? 'unknown',
      liquidityStatus: envelope.market.liquidityStatus ?? 'unknown',
      liquidityUsd: envelope.market.liquidityUsd,
    },
    contractVersion: envelope.contractVersion,
    promptVersion: envelope.promptVersion,
    provider: input.provider,
    model: input.model,
    dataQuality: {
      completeness: envelope.dataSnapshot.completeness,
      freshnessSeconds: envelope.dataSnapshot.freshnessSeconds,
      missing: envelope.dataSnapshot.missing,
    },
    prediction: response.prediction,
    confidence: response.confidence,
    recommendation: response.recommendation,
    evidence: response.evidence,
    risks: response.risks,
    rationaleSummary: response.rationaleSummary,
    marketComparison: envelope.market.outcomes.map((outcome) => {
      const modelProbability =
        response.prediction.outcomes.find((item) => item.outcomeId === outcome.outcomeId)
          ?.probability ?? 0;
      return {
        outcomeId: outcome.outcomeId,
        label: outcome.label,
        modelProbability,
        marketProbability: outcome.marketProbability,
        edge: modelProbability - outcome.marketProbability,
      };
    }),
    decision: {
      action: decision.action,
      reasonCodes: decision.reasonCodes,
    },
    audit: {
      validationStatus: 'valid',
      repairCount: input.repairCount ?? 0,
      latencyMs: input.latencyMs,
      tokenUsage: input.tokenUsage,
      generatedAt: new Date().toISOString(),
    },
  };
}
