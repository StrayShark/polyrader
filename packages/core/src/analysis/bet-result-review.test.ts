import { describe, expect, it } from 'vitest';
import {
  buildBetResultAnalysisArtifacts,
  type BetResultAnalysisRequestEnvelope,
  type BetResultAnalysisResponseV1,
  validateBetResultAnalysisResponse,
} from './bet-result-review';

const envelope: BetResultAnalysisRequestEnvelope = {
  contractVersion: 'bet-review.v1',
  analysisId: 'bra-test',
  promptVersion: 'bet-review.v1.0.0',
  locale: 'zh-CN',
  generatedAt: '2026-07-25T10:00:00.000Z',
  bet: {
    betId: 'bet-1',
    accountId: 'default',
    game: 'cs2',
    matchId: 'match-1',
    matchName: 'Spirit vs G2',
    marketId: 'market-1',
    marketKind: 'match_winner',
    betType: 'single',
    status: 'settled',
    result: 'lost',
    stake: 25,
    totalOdds: 2,
    pnl: -25,
    placedAt: '2026-07-24T10:00:00.000Z',
    settledAt: '2026-07-25T09:00:00.000Z',
    settlementSource: 'hltv',
    reasoning: 'analysis.v1',
    legs: [{
      legId: 'leg-1',
      matchId: 'match-1',
      marketId: 'market-1',
      selection: 'Spirit',
      odds: 2,
      result: 'lost',
    }],
  },
  preBetAnalysis: {
    runId: 'run-1',
    reportId: 'report-1',
    provider: 'openai',
    model: 'gpt-test',
    modelProbability: 0.65,
    marketProbability: 0.5,
    userProbability: 0.65,
    edgeAtEntry: 0.15,
    confidenceScore: 0.72,
    recommendationOutcomeId: 'spirit',
    decisionAction: 'paper_bet',
    decisionReasonCodes: ['PAPER_ORDER_CREATED'],
    rationaleSummary: 'Spirit had the stronger evidence set.',
  },
  metrics: {
    placementOdds: 2,
    closingOdds: 1.8,
    brierScore: 0.4225,
    closingLineValue: -0.1,
    roi: -1,
  },
  userReview: { errorTags: [], note: null },
  evidence: [
    {
      evidenceId: 'bet:result',
      category: 'bet',
      observedAt: '2026-07-25T09:00:00.000Z',
      value: { result: 'lost', pnl: -25 },
    },
    {
      evidenceId: 'metric:outcome-quality',
      category: 'metric',
      observedAt: '2026-07-25T09:00:00.000Z',
      value: { brierScore: 0.4225, closingLineValue: -0.1 },
    },
  ],
};

const response: BetResultAnalysisResponseV1 = {
  contractVersion: 'bet-review-response.v1',
  analysisId: 'bra-test',
  betId: 'bet-1',
  verdict: {
    decisionQuality: 'bad_process_bad_result',
    processScore: 0.35,
    confidence: 'medium',
    summary: 'The prediction was overconfident and lost value before close.',
  },
  attribution: {
    primary: 'mixed',
    factors: [{
      code: 'WEAK_CALIBRATION_AND_PRICE',
      category: 'model',
      impact: 'negative',
      evidenceIds: ['metric:outcome-quality'],
      summary: 'Brier and CLV both indicate weak decision quality.',
    }],
  },
  calibration: {
    brierScore: 0.4225,
    assessment: 'weak',
    summary: 'The supplied Brier Score is weak for this outcome.',
  },
  priceQuality: {
    closingLineValue: -0.1,
    assessment: 'lost_to_close',
    summary: 'The entry price was worse than the closing price.',
  },
  riskDiscipline: {
    assessment: 'within_policy',
    reasonCodes: ['FIXED_STAKE'],
    summary: 'No supplied evidence indicates a risk limit breach.',
  },
  lessons: [{
    code: 'RECHECK_CONFIDENCE',
    priority: 'high',
    action: 'Reduce confidence when the price moves materially against the selection.',
  }],
  suggestedErrorTags: ['overtrusted_ai'],
  summary: 'Separate the losing outcome from the weak calibration and negative CLV signals.',
};

describe('bet-review.v1', () => {
  it('builds immutable standard prompt artifacts', () => {
    const first = buildBetResultAnalysisArtifacts(envelope);
    const second = buildBetResultAnalysisArtifacts(envelope);
    expect(JSON.parse(first.inputJson).contractVersion).toBe('bet-review.v1');
    expect(JSON.parse(first.outputSchemaJson).properties.contractVersion.const).toBe(
      'bet-review-response.v1',
    );
    expect(first.systemPrompt).toContain('Judge decision process separately');
    expect(first.systemPrompt).toContain('INPUT.locale');
    expect(first.systemPrompt).toContain('Avoid hindsight leakage');
    expect(first.promptHash).toBe(second.promptHash);
  });

  it('accepts a standardized response with evidence references', () => {
    const result = validateBetResultAnalysisResponse(response, envelope);
    expect(result.ok).toBe(true);
    expect(result.value?.verdict.processScore).toBe(0.35);
  });

  it('rejects fabricated metrics and unknown evidence ids', () => {
    const invalid = structuredClone(response);
    invalid.calibration.brierScore = 0.1;
    invalid.attribution.factors[0].evidenceIds = ['unknown:evidence'];
    const result = validateBetResultAnalysisResponse(invalid, envelope);
    expect(result.ok).toBe(false);
    expect(result.errors.map((item) => item.code)).toContain('METRIC_MISMATCH');
    expect(result.errors.map((item) => item.code)).toContain('EVIDENCE_INVALID');
  });

  it('requires unavailable assessments when deterministic metrics are absent', () => {
    const withoutMetrics = structuredClone(envelope);
    withoutMetrics.metrics.brierScore = null;
    withoutMetrics.metrics.closingLineValue = null;
    const invalid = structuredClone(response);
    invalid.calibration.brierScore = null;
    invalid.priceQuality.closingLineValue = null;
    invalid.calibration.assessment = 'acceptable';
    invalid.priceQuality.assessment = 'flat';

    const result = validateBetResultAnalysisResponse(invalid, withoutMetrics);
    expect(result.ok).toBe(false);
    expect(result.errors.map((item) => item.path)).toEqual(
      expect.arrayContaining(['calibration.assessment', 'priceQuality.assessment']),
    );
  });
});
