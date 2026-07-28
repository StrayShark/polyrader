import type { EsportsGame, SimBetResult } from '../types/index';
import type { AnalysisMarketKind } from './types';
import { sha256Hex, stableStringify } from './hash';

export type BetResultAnalysisStatus =
  | 'prompt_ready'
  | 'provider_running'
  | 'valid'
  | 'invalid'
  | 'failed';

export type BetResultEvidenceCategory =
  | 'bet'
  | 'pre_bet_analysis'
  | 'settlement'
  | 'market'
  | 'metric'
  | 'user_review';

export interface BetResultEvidenceItem {
  evidenceId: string;
  category: BetResultEvidenceCategory;
  observedAt: string;
  value: unknown;
}

export interface BetResultAnalysisRequestEnvelope {
  contractVersion: 'bet-review.v1';
  analysisId: string;
  promptVersion: 'bet-review.v1.0.0';
  locale: string;
  generatedAt: string;
  bet: {
    betId: string;
    accountId: string;
    game: EsportsGame | 'unknown';
    matchId: string | null;
    matchName: string | null;
    marketId: string | null;
    marketKind: AnalysisMarketKind | 'unknown';
    betType: 'single' | 'parlay';
    status: 'settled';
    result: Exclude<SimBetResult, null>;
    stake: number;
    totalOdds: number;
    pnl: number;
    placedAt: string;
    settledAt: string | null;
    settlementSource: string | null;
    reasoning: string | null;
    legs: Array<{
      legId: string;
      matchId: string | null;
      marketId: string | null;
      selection: string;
      odds: number;
      result: SimBetResult;
    }>;
  };
  preBetAnalysis: {
    runId: string | null;
    reportId: string | null;
    provider: string | null;
    model: string | null;
    modelProbability: number | null;
    marketProbability: number | null;
    userProbability: number | null;
    edgeAtEntry: number | null;
    confidenceScore: number | null;
    recommendationOutcomeId: string | null;
    decisionAction: string | null;
    decisionReasonCodes: string[];
    rationaleSummary: string | null;
  };
  metrics: {
    placementOdds: number | null;
    closingOdds: number | null;
    brierScore: number | null;
    closingLineValue: number | null;
    roi: number | null;
  };
  userReview: {
    errorTags: string[];
    note: string | null;
  };
  evidence: BetResultEvidenceItem[];
}

export type BetResultFactorCategory =
  | 'data'
  | 'model'
  | 'market_price'
  | 'timing'
  | 'risk'
  | 'outcome_variance';

export interface BetResultAnalysisResponseV1 {
  contractVersion: 'bet-review-response.v1';
  analysisId: string;
  betId: string;
  verdict: {
    decisionQuality:
      | 'good_process_good_result'
      | 'good_process_bad_result'
      | 'bad_process_good_result'
      | 'bad_process_bad_result'
      | 'inconclusive';
    processScore: number;
    confidence: 'low' | 'medium' | 'high';
    summary: string;
  };
  attribution: {
    primary:
      | 'data'
      | 'model'
      | 'market_price'
      | 'timing'
      | 'risk'
      | 'outcome_variance'
      | 'mixed'
      | 'insufficient_data';
    factors: Array<{
      code: string;
      category: BetResultFactorCategory;
      impact: 'positive' | 'negative' | 'neutral';
      evidenceIds: string[];
      summary: string;
    }>;
  };
  calibration: {
    brierScore: number | null;
    assessment: 'strong' | 'acceptable' | 'weak' | 'unavailable';
    summary: string;
  };
  priceQuality: {
    closingLineValue: number | null;
    assessment: 'beat_close' | 'lost_to_close' | 'flat' | 'unavailable';
    summary: string;
  };
  riskDiscipline: {
    assessment: 'within_policy' | 'questionable' | 'breach' | 'unknown';
    reasonCodes: string[];
    summary: string;
  };
  lessons: Array<{
    code: string;
    priority: 'low' | 'medium' | 'high';
    action: string;
  }>;
  suggestedErrorTags: Array<
    | 'overrated_favorite'
    | 'ignored_map_pool'
    | 'chased_odds'
    | 'overtrusted_ai'
    | 'oversized_position'
    | 'missing_late_info'
  >;
  summary: string;
}

export interface BetResultAnalysisValidationError {
  code: string;
  path: string;
  message: string;
}

export interface BetResultAnalysisValidationResult {
  ok: boolean;
  errors: BetResultAnalysisValidationError[];
  value?: BetResultAnalysisResponseV1;
}

export interface BetResultAnalysisArtifact {
  id: string;
  betId: string;
  status: BetResultAnalysisStatus;
  contractVersion: 'bet-review.v1';
  promptVersion: 'bet-review.v1.0.0';
  responseSchemaVersion: 'bet-review-response.v1';
  provider?: string;
  model?: string;
  promptHash: string;
  systemPrompt: string;
  inputJson: string;
  outputSchemaJson: string;
  rawResponse?: string;
  normalizedResponseJson?: string;
  validationErrors: BetResultAnalysisValidationError[];
  response?: BetResultAnalysisResponseV1;
  latencyMs?: number;
  createdAt: string;
  updatedAt: string;
}

export const BET_RESULT_ANALYSIS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion',
    'analysisId',
    'betId',
    'verdict',
    'attribution',
    'calibration',
    'priceQuality',
    'riskDiscipline',
    'lessons',
    'suggestedErrorTags',
    'summary',
  ],
  properties: {
    contractVersion: { const: 'bet-review-response.v1' },
    analysisId: { type: 'string' },
    betId: { type: 'string' },
    verdict: {
      type: 'object',
      additionalProperties: false,
      required: ['decisionQuality', 'processScore', 'confidence', 'summary'],
      properties: {
        decisionQuality: {
          enum: [
            'good_process_good_result',
            'good_process_bad_result',
            'bad_process_good_result',
            'bad_process_bad_result',
            'inconclusive',
          ],
        },
        processScore: { type: 'number', minimum: 0, maximum: 1 },
        confidence: { enum: ['low', 'medium', 'high'] },
        summary: { type: 'string', minLength: 1, maxLength: 600 },
      },
    },
    attribution: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'factors'],
      properties: {
        primary: {
          enum: [
            'data',
            'model',
            'market_price',
            'timing',
            'risk',
            'outcome_variance',
            'mixed',
            'insufficient_data',
          ],
        },
        factors: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'category', 'impact', 'evidenceIds', 'summary'],
            properties: {
              code: { type: 'string', minLength: 1, maxLength: 80 },
              category: {
                enum: ['data', 'model', 'market_price', 'timing', 'risk', 'outcome_variance'],
              },
              impact: { enum: ['positive', 'negative', 'neutral'] },
              evidenceIds: {
                type: 'array',
                minItems: 1,
                maxItems: 12,
                items: { type: 'string' },
              },
              summary: { type: 'string', minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
    calibration: {
      type: 'object',
      additionalProperties: false,
      required: ['brierScore', 'assessment', 'summary'],
      properties: {
        brierScore: { type: ['number', 'null'] },
        assessment: { enum: ['strong', 'acceptable', 'weak', 'unavailable'] },
        summary: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
    priceQuality: {
      type: 'object',
      additionalProperties: false,
      required: ['closingLineValue', 'assessment', 'summary'],
      properties: {
        closingLineValue: { type: ['number', 'null'] },
        assessment: { enum: ['beat_close', 'lost_to_close', 'flat', 'unavailable'] },
        summary: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
    riskDiscipline: {
      type: 'object',
      additionalProperties: false,
      required: ['assessment', 'reasonCodes', 'summary'],
      properties: {
        assessment: { enum: ['within_policy', 'questionable', 'breach', 'unknown'] },
        reasonCodes: { type: 'array', maxItems: 16, items: { type: 'string' } },
        summary: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
    lessons: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'priority', 'action'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 80 },
          priority: { enum: ['low', 'medium', 'high'] },
          action: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
    suggestedErrorTags: {
      type: 'array',
      uniqueItems: true,
      maxItems: 6,
      items: {
        enum: [
          'overrated_favorite',
          'ignored_map_pool',
          'chased_odds',
          'overtrusted_ai',
          'oversized_position',
          'missing_late_info',
        ],
      },
    },
    summary: { type: 'string', minLength: 1, maxLength: 900 },
  },
} as const;

export const BET_RESULT_ANALYSIS_SYSTEM_PROMPT = `You are reviewing the outcome of a simulated esports bet inside a local training tool.

Use only the supplied INPUT. Do not invent match events, closing prices, roster changes, injuries, maps, or reasons for the result. Every causal factor must cite one or more evidenceId values from INPUT.evidence.

Judge decision process separately from the realized result. A winning bet can have a poor process and a losing bet can have a good process. Treat supplied Brier Score, CLV, ROI, probabilities, stake, and PnL as immutable measurements; never recalculate or replace them.

Avoid hindsight leakage. Do not infer a systematic model bias, reliable threshold, or strategy rule from one settled bet. Brier Score, CLV, ROI, and the result are post-settlement review evidence; never propose using their realized values as information that could have been known before this bet. Aggregate-calibration lessons must explicitly require a sufficient comparable sample.

Return only JSON that validates against OUTPUT_SCHEMA. Do not return Markdown, code fences, commentary, or hidden chain-of-thought. Keep summaries concise and action-oriented.

Write all user-facing summary and action fields in INPUT.locale. Keep contract enums, reason codes, lesson codes, and factor codes as stable English machine-readable values. Do not place literal double-quote characters inside JSON string values; use locale-appropriate punctuation without breaking JSON syntax.

This is retrospective analysis for simulated practice only. Do not recommend deposits, real-money wagers, chasing losses, or bypassing product risk controls.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(
  errors: BetResultAnalysisValidationError[],
  path: string,
  message: string,
  code = 'INVALID_RESPONSE',
): void {
  errors.push({ code, path, message });
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: BetResultAnalysisValidationError[],
): void {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) error(errors, path ? `${path}.${key}` : key, `Unknown field "${key}"`);
  }
}

function validText(
  value: unknown,
  path: string,
  errors: BetResultAnalysisValidationError[],
  max: number,
): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    error(errors, path, `${path} must contain 1..${max} characters`);
    return false;
  }
  return true;
}

function validEnum(
  value: unknown,
  values: readonly string[],
  path: string,
  errors: BetResultAnalysisValidationError[],
): boolean {
  if (!values.includes(String(value))) {
    error(errors, path, `${path} must be one of ${values.join('|')}`);
    return false;
  }
  return true;
}

function validStringArray(
  value: unknown,
  path: string,
  errors: BetResultAnalysisValidationError[],
  max: number,
  allowed?: Set<string>,
  min = 0,
): value is string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    error(errors, path, `${path} must contain ${min}..${max} items`);
    return false;
  }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      error(errors, `${path}[${index}]`, 'Must be a non-empty string');
    } else if (allowed && !allowed.has(item)) {
      error(errors, `${path}[${index}]`, `Unknown value "${item}"`, 'EVIDENCE_INVALID');
    } else if (seen.has(item)) {
      error(errors, `${path}[${index}]`, `Duplicate value "${item}"`);
    }
    if (typeof item === 'string') seen.add(item);
  });
  return true;
}

function validateMeasuredValue(
  actual: unknown,
  expected: number | null,
  path: string,
  errors: BetResultAnalysisValidationError[],
): void {
  if (expected === null) {
    if (actual !== null) error(errors, path, `${path} must be null when the input metric is unavailable`);
    return;
  }
  if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-6) {
    error(errors, path, `${path} must exactly preserve the supplied input metric`, 'METRIC_MISMATCH');
  }
}

export function validateBetResultAnalysisResponse(
  raw: unknown,
  envelope: BetResultAnalysisRequestEnvelope,
): BetResultAnalysisValidationResult {
  const errors: BetResultAnalysisValidationError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ code: 'INVALID_RESPONSE', path: '$', message: 'Response must be a JSON object' }] };
  }

  rejectUnknown(raw, [
    'contractVersion',
    'analysisId',
    'betId',
    'verdict',
    'attribution',
    'calibration',
    'priceQuality',
    'riskDiscipline',
    'lessons',
    'suggestedErrorTags',
    'summary',
  ], '', errors);
  if (raw.contractVersion !== 'bet-review-response.v1') error(errors, 'contractVersion', 'Must be bet-review-response.v1');
  if (raw.analysisId !== envelope.analysisId) error(errors, 'analysisId', 'analysisId must match INPUT');
  if (raw.betId !== envelope.bet.betId) error(errors, 'betId', 'betId must match INPUT');

  const verdict = raw.verdict;
  if (!isRecord(verdict)) {
    error(errors, 'verdict', 'verdict must be an object');
  } else {
    rejectUnknown(verdict, ['decisionQuality', 'processScore', 'confidence', 'summary'], 'verdict', errors);
    validEnum(verdict.decisionQuality, [
      'good_process_good_result', 'good_process_bad_result', 'bad_process_good_result',
      'bad_process_bad_result', 'inconclusive',
    ], 'verdict.decisionQuality', errors);
    if (typeof verdict.processScore !== 'number' || !Number.isFinite(verdict.processScore) || verdict.processScore < 0 || verdict.processScore > 1) {
      error(errors, 'verdict.processScore', 'processScore must be in [0,1]');
    }
    validEnum(verdict.confidence, ['low', 'medium', 'high'], 'verdict.confidence', errors);
    validText(verdict.summary, 'verdict.summary', errors, 600);
  }

  const evidenceIds = new Set(envelope.evidence.map((item) => item.evidenceId));
  const attribution = raw.attribution;
  if (!isRecord(attribution)) {
    error(errors, 'attribution', 'attribution must be an object');
  } else {
    rejectUnknown(attribution, ['primary', 'factors'], 'attribution', errors);
    validEnum(attribution.primary, [
      'data', 'model', 'market_price', 'timing', 'risk', 'outcome_variance', 'mixed', 'insufficient_data',
    ], 'attribution.primary', errors);
    if (!Array.isArray(attribution.factors) || attribution.factors.length > 12) {
      error(errors, 'attribution.factors', 'factors must contain at most 12 items');
    } else {
      attribution.factors.forEach((factor, index) => {
        const path = `attribution.factors[${index}]`;
        if (!isRecord(factor)) {
          error(errors, path, 'Factor must be an object');
          return;
        }
        rejectUnknown(factor, ['code', 'category', 'impact', 'evidenceIds', 'summary'], path, errors);
        validText(factor.code, `${path}.code`, errors, 80);
        validEnum(factor.category, ['data', 'model', 'market_price', 'timing', 'risk', 'outcome_variance'], `${path}.category`, errors);
        validEnum(factor.impact, ['positive', 'negative', 'neutral'], `${path}.impact`, errors);
        validStringArray(factor.evidenceIds, `${path}.evidenceIds`, errors, 12, evidenceIds, 1);
        validText(factor.summary, `${path}.summary`, errors, 500);
      });
    }
  }

  const calibration = raw.calibration;
  if (!isRecord(calibration)) {
    error(errors, 'calibration', 'calibration must be an object');
  } else {
    rejectUnknown(calibration, ['brierScore', 'assessment', 'summary'], 'calibration', errors);
    validateMeasuredValue(calibration.brierScore, envelope.metrics.brierScore, 'calibration.brierScore', errors);
    validEnum(calibration.assessment, ['strong', 'acceptable', 'weak', 'unavailable'], 'calibration.assessment', errors);
    if (envelope.metrics.brierScore === null && calibration.assessment !== 'unavailable') {
      error(errors, 'calibration.assessment', 'assessment must be unavailable when Brier Score is unavailable');
    }
    validText(calibration.summary, 'calibration.summary', errors, 500);
  }

  const priceQuality = raw.priceQuality;
  if (!isRecord(priceQuality)) {
    error(errors, 'priceQuality', 'priceQuality must be an object');
  } else {
    rejectUnknown(priceQuality, ['closingLineValue', 'assessment', 'summary'], 'priceQuality', errors);
    validateMeasuredValue(priceQuality.closingLineValue, envelope.metrics.closingLineValue, 'priceQuality.closingLineValue', errors);
    validEnum(priceQuality.assessment, ['beat_close', 'lost_to_close', 'flat', 'unavailable'], 'priceQuality.assessment', errors);
    if (envelope.metrics.closingLineValue === null && priceQuality.assessment !== 'unavailable') {
      error(errors, 'priceQuality.assessment', 'assessment must be unavailable when CLV is unavailable');
    }
    validText(priceQuality.summary, 'priceQuality.summary', errors, 500);
  }

  const risk = raw.riskDiscipline;
  if (!isRecord(risk)) {
    error(errors, 'riskDiscipline', 'riskDiscipline must be an object');
  } else {
    rejectUnknown(risk, ['assessment', 'reasonCodes', 'summary'], 'riskDiscipline', errors);
    validEnum(risk.assessment, ['within_policy', 'questionable', 'breach', 'unknown'], 'riskDiscipline.assessment', errors);
    validStringArray(risk.reasonCodes, 'riskDiscipline.reasonCodes', errors, 16);
    validText(risk.summary, 'riskDiscipline.summary', errors, 500);
  }

  if (!Array.isArray(raw.lessons) || raw.lessons.length > 8) {
    error(errors, 'lessons', 'lessons must contain at most 8 items');
  } else {
    raw.lessons.forEach((lesson, index) => {
      const path = `lessons[${index}]`;
      if (!isRecord(lesson)) {
        error(errors, path, 'Lesson must be an object');
        return;
      }
      rejectUnknown(lesson, ['code', 'priority', 'action'], path, errors);
      validText(lesson.code, `${path}.code`, errors, 80);
      validEnum(lesson.priority, ['low', 'medium', 'high'], `${path}.priority`, errors);
      validText(lesson.action, `${path}.action`, errors, 500);
    });
  }

  validStringArray(raw.suggestedErrorTags, 'suggestedErrorTags', errors, 6, new Set([
    'overrated_favorite', 'ignored_map_pool', 'chased_odds', 'overtrusted_ai',
    'oversized_position', 'missing_late_info',
  ]));
  validText(raw.summary, 'summary', errors, 900);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: raw as unknown as BetResultAnalysisResponseV1 };
}

export function parseBetResultAnalysisResponseJson(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return JSON.parse(fenced ? fenced[1].trim() : trimmed) as unknown;
}

export function buildBetResultAnalysisArtifacts(envelope: BetResultAnalysisRequestEnvelope): {
  systemPrompt: string;
  inputJson: string;
  outputSchemaJson: string;
  promptHash: string;
} {
  const inputJson = stableStringify(envelope);
  const outputSchemaJson = stableStringify(BET_RESULT_ANALYSIS_OUTPUT_SCHEMA);
  const systemPrompt = `${BET_RESULT_ANALYSIS_SYSTEM_PROMPT}\n\nOUTPUT_SCHEMA:\n${outputSchemaJson}`;
  const promptHash = `sha256:${sha256Hex(stableStringify({ systemPrompt, input: envelope, outputSchema: BET_RESULT_ANALYSIS_OUTPUT_SCHEMA }))}`;
  return { systemPrompt, inputJson, outputSchemaJson, promptHash };
}
