import type {
  AnalysisRequestEnvelope,
  AnalysisResponseV1,
} from './types';

export interface AnalysisValidationError {
  code: string;
  path: string;
  message: string;
}

export interface AnalysisValidationResult {
  ok: boolean;
  errors: AnalysisValidationError[];
  value?: AnalysisResponseV1;
}

const MAX_SUMMARY = 500;
const MAX_RATIONALE = 800;
const MAX_REASON_CODES = 20;
const MAX_EVIDENCE = 24;
const MAX_RISKS = 24;
const BANNED_FIELDS = new Set(['stake', 'wallet', 'deposit', 'order', 'betAmount']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function push(
  errors: AnalysisValidationError[],
  code: string,
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: AnalysisValidationError[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    const itemPath = path ? `${path}.${key}` : key;
    if (!allowedSet.has(key)) {
      push(errors, 'INVALID_RESPONSE', itemPath, `Unknown field "${key}"`);
    }
  }
}

function rejectForbiddenFields(
  value: unknown,
  path: string,
  errors: AnalysisValidationError[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenFields(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = path ? `${path}.${key}` : key;
    if (BANNED_FIELDS.has(key)) {
      push(errors, 'INVALID_RESPONSE', itemPath, `Forbidden field "${key}"`);
    }
    rejectForbiddenFields(item, itemPath, errors);
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  errors: AnalysisValidationError[],
  options: { min?: number; max?: number } = {},
): value is string[] {
  if (!Array.isArray(value)) {
    push(errors, 'INVALID_RESPONSE', path, `${path} must be an array`);
    return false;
  }
  if (value.length < (options.min ?? 0) || value.length > (options.max ?? Number.MAX_SAFE_INTEGER)) {
    push(errors, 'INVALID_RESPONSE', path, `${path} contains an invalid number of items`);
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      push(errors, 'INVALID_RESPONSE', `${path}[${index}]`, 'Must be a non-empty string');
    }
  });
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

/** Strict validation for analysis-response.v1 against the request envelope. */
export function validateAnalysisResponse(
  raw: unknown,
  envelope: AnalysisRequestEnvelope,
): AnalysisValidationResult {
  const errors: AnalysisValidationError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ code: 'INVALID_RESPONSE', path: '$', message: 'Response must be a JSON object' }] };
  }

  rejectUnknownKeys(raw, [
    'contractVersion', 'runId', 'prediction', 'confidence', 'recommendation', 'evidence', 'risks', 'rationaleSummary',
  ], '', errors);
  rejectForbiddenFields(raw, '', errors);

  if (raw.contractVersion !== 'analysis-response.v1') {
    push(errors, 'INVALID_RESPONSE', 'contractVersion', 'Must be analysis-response.v1');
  }
  if (raw.runId !== envelope.runId) {
    push(errors, 'INVALID_RESPONSE', 'runId', 'runId must match the request envelope');
  }

  const prediction = raw.prediction;
  const outcomeIds = new Set(envelope.market.outcomes.map((o) => o.outcomeId));
  const factIds = new Set(envelope.dataSnapshot.facts.map((f) => f.factId));
  let parsedOutcomes: AnalysisResponseV1['prediction']['outcomes'] = [];

  if (!isRecord(prediction) || !Array.isArray(prediction.outcomes)) {
    push(errors, 'INVALID_RESPONSE', 'prediction.outcomes', 'prediction.outcomes must be an array');
  } else {
    rejectUnknownKeys(prediction, ['outcomes'], 'prediction', errors);
    const seenOutcomeIds = new Set<string>();
    parsedOutcomes = prediction.outcomes.map((item, index) => {
      if (!isRecord(item)) {
        push(errors, 'INVALID_RESPONSE', `prediction.outcomes[${index}]`, 'Outcome must be an object');
        return { outcomeId: '', probability: NaN };
      }
      rejectUnknownKeys(item, ['outcomeId', 'probability'], `prediction.outcomes[${index}]`, errors);
      const outcomeId = typeof item.outcomeId === 'string' ? item.outcomeId : '';
      const probability = typeof item.probability === 'number' ? item.probability : NaN;
      if (!outcomeIds.has(outcomeId)) {
        push(errors, 'INVALID_RESPONSE', `prediction.outcomes[${index}].outcomeId`, `Unknown outcomeId "${outcomeId}"`);
      }
      if (seenOutcomeIds.has(outcomeId)) {
        push(errors, 'INVALID_RESPONSE', `prediction.outcomes[${index}].outcomeId`, `Duplicate outcomeId "${outcomeId}"`);
      }
      seenOutcomeIds.add(outcomeId);
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        push(errors, 'INVALID_RESPONSE', `prediction.outcomes[${index}].probability`, 'Probability must be in [0, 1]');
      }
      return { outcomeId, probability };
    });
    const sum = parsedOutcomes.reduce((acc, item) => acc + (Number.isFinite(item.probability) ? item.probability : 0), 0);
    if (Math.abs(sum - 1) > 0.001) {
      push(errors, 'INVALID_RESPONSE', 'prediction.outcomes', `Probabilities must sum to 1 ± 0.001 (got ${sum})`);
    }
    for (const expected of outcomeIds) {
      if (!parsedOutcomes.some((item) => item.outcomeId === expected)) {
        push(errors, 'INVALID_RESPONSE', 'prediction.outcomes', `Missing outcomeId "${expected}"`);
      }
    }
  }

  const confidence = raw.confidence;
  if (!isRecord(confidence)) {
    push(errors, 'INVALID_RESPONSE', 'confidence', 'confidence must be an object');
  } else {
    rejectUnknownKeys(confidence, ['score', 'grade', 'reasonCodes'], 'confidence', errors);
    const score = typeof confidence.score === 'number' ? confidence.score : NaN;
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      push(errors, 'INVALID_RESPONSE', 'confidence.score', 'Confidence score must be in [0, 1]');
    }
    if (!['low', 'medium', 'high'].includes(String(confidence.grade))) {
      push(errors, 'INVALID_RESPONSE', 'confidence.grade', 'grade must be low|medium|high');
    }
    validateStringArray(confidence.reasonCodes, 'confidence.reasonCodes', errors, { max: MAX_REASON_CODES });
  }

  const recommendation = raw.recommendation;
  if (!isRecord(recommendation)) {
    push(errors, 'INVALID_RESPONSE', 'recommendation', 'recommendation must be an object');
  } else {
    rejectUnknownKeys(recommendation, ['action', 'outcomeId'], 'recommendation', errors);
    const action = String(recommendation.action);
    if (action !== 'recommend_outcome' && action !== 'pass') {
      push(errors, 'INVALID_RESPONSE', 'recommendation.action', 'action must be recommend_outcome|pass');
    }
    if (action === 'pass' && recommendation.outcomeId !== null) {
      push(errors, 'INVALID_RESPONSE', 'recommendation.outcomeId', 'pass requires outcomeId null');
    }
    if (action === 'recommend_outcome') {
      const outcomeId = recommendation.outcomeId;
      if (typeof outcomeId !== 'string' || !outcomeIds.has(outcomeId)) {
        push(errors, 'INVALID_RESPONSE', 'recommendation.outcomeId', 'recommend_outcome requires a valid outcomeId');
      }
    }
  }

  if (!Array.isArray(raw.evidence)) {
    push(errors, 'INVALID_RESPONSE', 'evidence', 'evidence must be an array');
  } else {
    if (raw.evidence.length > MAX_EVIDENCE) {
      push(errors, 'INVALID_RESPONSE', 'evidence', `evidence must contain at most ${MAX_EVIDENCE} items`);
    }
    raw.evidence.forEach((item, index) => {
      if (!isRecord(item)) {
        push(errors, 'EVIDENCE_INVALID', `evidence[${index}]`, 'Evidence item must be an object');
        return;
      }
      rejectUnknownKeys(item, ['factIds', 'direction', 'impact', 'summary'], `evidence[${index}]`, errors);
      if (!validateStringArray(item.factIds, `evidence[${index}].factIds`, errors, { min: 1, max: 20 })) {
        push(errors, 'EVIDENCE_INVALID', `evidence[${index}].factIds`, 'factIds required');
      }
      for (const factId of Array.isArray(item.factIds) ? item.factIds : []) {
        if (!factIds.has(String(factId))) {
          push(errors, 'EVIDENCE_INVALID', `evidence[${index}].factIds`, `Unknown factId "${String(factId)}"`);
        }
      }
      if (!['supports', 'opposes', 'neutral'].includes(String(item.direction))) {
        push(errors, 'INVALID_RESPONSE', `evidence[${index}].direction`, 'direction must be supports|opposes|neutral');
      }
      if (!['low', 'medium', 'high'].includes(String(item.impact))) {
        push(errors, 'INVALID_RESPONSE', `evidence[${index}].impact`, 'impact must be low|medium|high');
      }
      if (typeof item.summary !== 'string' || item.summary.length === 0 || item.summary.length > MAX_SUMMARY) {
        push(errors, 'INVALID_RESPONSE', `evidence[${index}].summary`, `summary length must be 1..${MAX_SUMMARY}`);
      }
    });
  }

  if (!Array.isArray(raw.risks)) {
    push(errors, 'INVALID_RESPONSE', 'risks', 'risks must be an array');
  } else {
    if (raw.risks.length > MAX_RISKS) {
      push(errors, 'INVALID_RESPONSE', 'risks', `risks must contain at most ${MAX_RISKS} items`);
    }
    raw.risks.forEach((item, index) => {
      if (!isRecord(item)) {
        push(errors, 'INVALID_RESPONSE', `risks[${index}]`, 'Risk item must be an object');
        return;
      }
      rejectUnknownKeys(item, ['code', 'severity', 'summary'], `risks[${index}]`, errors);
      if (typeof item.code !== 'string' || item.code.trim().length === 0) {
        push(errors, 'INVALID_RESPONSE', `risks[${index}].code`, 'code must be a non-empty string');
      }
      if (!['low', 'medium', 'high'].includes(String(item.severity))) {
        push(errors, 'INVALID_RESPONSE', `risks[${index}].severity`, 'severity must be low|medium|high');
      }
      if (typeof item.summary !== 'string' || item.summary.length === 0 || item.summary.length > MAX_SUMMARY) {
        push(errors, 'INVALID_RESPONSE', `risks[${index}].summary`, `summary length must be 1..${MAX_SUMMARY}`);
      }
    });
  }

  if (typeof raw.rationaleSummary !== 'string'
    || raw.rationaleSummary.length === 0
    || raw.rationaleSummary.length > MAX_RATIONALE) {
    push(errors, 'INVALID_RESPONSE', 'rationaleSummary', `rationaleSummary length must be 1..${MAX_RATIONALE}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      contractVersion: 'analysis-response.v1',
      runId: envelope.runId,
      prediction: { outcomes: parsedOutcomes },
      confidence: {
        score: Number((raw.confidence as Record<string, unknown>).score),
        grade: (raw.confidence as Record<string, unknown>).grade as 'low' | 'medium' | 'high',
        reasonCodes: ((raw.confidence as Record<string, unknown>).reasonCodes as string[]) ?? [],
      },
      recommendation: {
        action: (raw.recommendation as Record<string, unknown>).action as 'recommend_outcome' | 'pass',
        outcomeId: ((raw.recommendation as Record<string, unknown>).outcomeId as string | null) ?? null,
      },
      evidence: (raw.evidence as AnalysisResponseV1['evidence']),
      risks: (raw.risks as AnalysisResponseV1['risks']),
      rationaleSummary: String(raw.rationaleSummary),
    },
  };
}

/** Parse provider text into JSON, stripping optional fences. */
export function parseAnalysisResponseJson(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(body) as unknown;
}
