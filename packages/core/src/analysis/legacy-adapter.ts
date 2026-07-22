import type { LLMAnalysisResult, LLMProvider } from '../types/index';
import type { AnalysisRequestEnvelope, AnalysisResponseV1 } from './types';

/** Providers that often omit confidence; map unstated (0) → 0.6 for paper policy only. */
const PROVIDERS_WITH_UNSTATED_CONFIDENCE_DEFAULT = new Set<LLMProvider>(['doubao']);

/**
 * Compatibility adapter: map legacy CS2 LLMAnalysisResult into analysis-response.v1.
 * Used only during migration so existing providers can feed the new pipeline.
 */
export function legacyResultToAnalysisResponse(input: {
  envelope: AnalysisRequestEnvelope;
  result: LLMAnalysisResult;
}): AnalysisResponseV1 {
  const teamA = input.envelope.match.participants.find((p) => p.side === 'a');
  const teamB = input.envelope.match.participants.find((p) => p.side === 'b');
  const outcomeA = input.envelope.market.outcomes.find((o) => o.outcomeId === teamA?.participantId)
    ?? input.envelope.market.outcomes[0];
  const outcomeB = input.envelope.market.outcomes.find((o) => o.outcomeId === teamB?.participantId)
    ?? input.envelope.market.outcomes[1];

  const pA = clamp01(input.result.winProbability.teamA);
  const pB = clamp01(input.result.winProbability.teamB);
  const sum = pA + pB || 1;
  const probA = pA / sum;
  const probB = pB / sum;
  const recommendA = probA >= probB;
  const factIds = input.envelope.dataSnapshot.facts.slice(0, 3).map((f) => f.factId);
  const raw = Number(input.result.confidence);
  const allowDefault = PROVIDERS_WITH_UNSTATED_CONFIDENCE_DEFAULT.has(input.result.provider);
  const unstated = allowDefault && (!Number.isFinite(raw) || raw <= 0);
  const score = unstated ? 0.6 : clamp01(Number.isFinite(raw) ? raw : 0);

  return {
    contractVersion: 'analysis-response.v1',
    runId: input.envelope.runId,
    prediction: {
      outcomes: [
        { outcomeId: outcomeA.outcomeId, probability: probA },
        { outcomeId: outcomeB.outcomeId, probability: probB },
      ],
    },
    confidence: {
      score,
      grade: score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low',
      reasonCodes: input.result.error
        ? ['PROVIDER_ERROR']
        : unstated
          ? ['CONFIDENCE_DEFAULT_UNSTATED']
          : [],
    },
    recommendation: input.result.error
      ? { action: 'pass', outcomeId: null }
      : {
          action: 'recommend_outcome',
          outcomeId: recommendA ? outcomeA.outcomeId : outcomeB.outcomeId,
        },
    evidence: factIds.length > 0
      ? [{
          factIds,
          direction: 'supports',
          impact: 'medium',
          summary: (input.result.keyFactors[0] ?? input.result.reasoning).slice(0, 200),
        }]
      : [],
    risks: input.result.riskAssessment
      ? [{
          code: 'LEGACY_RISK',
          severity: 'medium',
          summary: input.result.riskAssessment.slice(0, 200),
        }]
      : [],
    rationaleSummary: (input.result.reasoning || 'Legacy provider analysis.').slice(0, 800),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
