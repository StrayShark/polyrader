/** analysis.v1 contract types — see docs/contracts/llm-analysis-contract.md */

import type { EsportsGame } from '../types/index';

export type { EsportsGame };

export type AnalysisMarketKind =
  | 'match_winner'
  | 'map_winner'
  | 'handicap'
  | 'total_maps'
  | 'correct_score';

export type AnalysisRunStatus =
  | 'created'
  | 'prompt_ready'
  | 'provider_running'
  | 'validated'
  | 'invalid_response'
  | 'report_ready'
  | 'decision_ready'
  | 'failed';

export type AnalysisValidationStatus = 'pending' | 'valid' | 'invalid' | 'repaired';

export type AnalysisStageStatus =
  | 'waiting'
  | 'running'
  | 'passed'
  | 'warning'
  | 'failed'
  | 'skipped';

export type PaperDecisionAction = 'paper_bet' | 'pass' | 'rejected';

export type RecommendationAction = 'recommend_outcome' | 'pass';

export interface AnalysisFact {
  factId: string;
  entityType: string;
  source: string;
  observedAt: string;
  field: string;
  value: unknown;
}

export interface AnalysisParticipant {
  participantId: string;
  name: string;
  side: 'a' | 'b';
}

export interface AnalysisMarketOutcome {
  outcomeId: string;
  label: string;
  marketProbability: number;
}

export interface AnalysisRequestEnvelope {
  contractVersion: 'analysis.v1';
  runId: string;
  promptVersion: string;
  game: EsportsGame;
  locale: string;
  generatedAt: string;
  match: {
    matchId: string;
    eventId?: string;
    eventName: string;
    startsAt: string;
    format: 'BO1' | 'BO3' | 'BO5';
    status: string;
    participants: AnalysisParticipant[];
  };
  market: {
    marketId: string;
    kind: AnalysisMarketKind;
    line: number | null;
    outcomes: AnalysisMarketOutcome[];
    liquidityUsd: number;
    observedAt: string;
  };
  dataSnapshot: {
    dataSnapshotHash: string;
    completeness: number;
    freshnessSeconds: number;
    facts: AnalysisFact[];
    missing: string[];
  };
  policy: {
    minimumCompleteness: number;
    maximumFreshnessSeconds: number;
    minimumConfidence: number;
    minimumEdge: number;
    lowLiquidityThresholdUsd: number;
    allowedActions: RecommendationAction[];
  };
}

export interface AnalysisResponseOutcome {
  outcomeId: string;
  probability: number;
}

export interface AnalysisResponseV1 {
  contractVersion: 'analysis-response.v1';
  runId: string;
  prediction: {
    outcomes: AnalysisResponseOutcome[];
  };
  confidence: {
    score: number;
    grade: 'low' | 'medium' | 'high';
    reasonCodes: string[];
  };
  recommendation: {
    action: RecommendationAction;
    outcomeId: string | null;
  };
  evidence: Array<{
    factIds: string[];
    direction: 'supports' | 'opposes' | 'neutral';
    impact: 'low' | 'medium' | 'high';
    summary: string;
  }>;
  risks: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high';
    summary: string;
  }>;
  rationaleSummary: string;
}

export interface AnalysisReport {
  id: string;
  runId: string;
  game: EsportsGame;
  matchId: string;
  marketId: string;
  marketKind: AnalysisMarketKind;
  contractVersion: string;
  promptVersion: string;
  provider?: string;
  model?: string;
  dataQuality: {
    completeness: number;
    freshnessSeconds: number;
    missing: string[];
  };
  prediction: AnalysisResponseV1['prediction'];
  confidence: AnalysisResponseV1['confidence'];
  recommendation: AnalysisResponseV1['recommendation'];
  evidence: AnalysisResponseV1['evidence'];
  risks: AnalysisResponseV1['risks'];
  rationaleSummary: string;
  marketComparison: Array<{
    outcomeId: string;
    label: string;
    modelProbability: number;
    marketProbability: number;
    edge: number;
  }>;
  decision: {
    action: PaperDecisionAction;
    reasonCodes: string[];
  };
  audit: {
    validationStatus: AnalysisValidationStatus;
    repairCount: number;
    latencyMs?: number;
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    generatedAt: string;
  };
}

export interface PaperPolicyProfile {
  policyVersion: string;
  minimumCompleteness: number;
  maximumFreshnessSeconds: number;
  minimumConfidence: number;
  minimumEdge: number;
  lowLiquidityThresholdUsd: number;
  maxSingleStake: number;
  stakeMode: 'fixed' | 'proportional' | 'fractional_kelly' | 'no_bet';
  fixedStake: number;
  bankrollFraction: number;
  requireAuthoritativeSettlement: boolean;
}

export interface PaperDecisionResult {
  action: PaperDecisionAction;
  reasonCodes: string[];
  outcomeId: string | null;
  modelProbability: number | null;
  marketProbability: number | null;
  edgeAtEntry: number | null;
  stake: number;
  price: number | null;
  policyVersion: string;
}

export const ANALYSIS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion',
    'runId',
    'prediction',
    'confidence',
    'recommendation',
    'evidence',
    'risks',
    'rationaleSummary',
  ],
  properties: {
    contractVersion: { const: 'analysis-response.v1' },
    runId: { type: 'string' },
    prediction: {
      type: 'object',
      additionalProperties: false,
      required: ['outcomes'],
      properties: {
        outcomes: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['outcomeId', 'probability'],
            properties: {
              outcomeId: { type: 'string' },
              probability: { type: 'number' },
            },
          },
        },
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'grade', 'reasonCodes'],
      properties: {
        score: { type: 'number' },
        grade: { enum: ['low', 'medium', 'high'] },
        reasonCodes: { type: 'array', items: { type: 'string' } },
      },
    },
    recommendation: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'outcomeId'],
      properties: {
        action: { enum: ['recommend_outcome', 'pass'] },
        outcomeId: { type: ['string', 'null'] },
      },
    },
    evidence: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factIds', 'direction', 'impact', 'summary'],
        properties: {
          factIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } },
          direction: { enum: ['supports', 'opposes', 'neutral'] },
          impact: { enum: ['low', 'medium', 'high'] },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    risks: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'severity', 'summary'],
        properties: {
          code: { type: 'string', minLength: 1 },
          severity: { enum: ['low', 'medium', 'high'] },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    rationaleSummary: { type: 'string', minLength: 1, maxLength: 800 },
  },
} as const;

export const DEFAULT_PAPER_POLICY: PaperPolicyProfile = {
  policyVersion: 'paper.v1.1.0',
  minimumCompleteness: 0.7,
  maximumFreshnessSeconds: 60 * 60,
  minimumConfidence: 0.6,
  minimumEdge: 0.05,
  lowLiquidityThresholdUsd: 1000,
  maxSingleStake: 100,
  stakeMode: 'fixed',
  fixedStake: 25,
  bankrollFraction: 0.02,
  requireAuthoritativeSettlement: true,
};

export const ANALYSIS_SYSTEM_PROMPT = `You are an esports probability analyst operating inside a local simulated-betting
training tool.

Use only facts supplied in INPUT. Do not invent missing rosters, rankings, patches,
maps, prices, or results. Every material claim must reference one or more factId
values from INPUT.dataSnapshot.facts.

Return only JSON that validates against OUTPUT_SCHEMA. Do not return Markdown,
commentary, code fences, or hidden chain-of-thought. Provide only a concise
rationaleSummary, evidence references, uncertainty, and risk codes.

This is a simulated decision. Do not advise deposits, withdrawals, real-money bets,
or attempts to bypass product risk limits. The runtime, not the model, determines the
final simulated stake.`;
