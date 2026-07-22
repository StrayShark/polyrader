import type { AnalysisRequestEnvelope, AnalysisResponseV1 } from './types';
import { parseAnalysisResponseJson, validateAnalysisResponse, type AnalysisValidationResult } from './validate-response';

/**
 * One bounded local repair for provider responses before marking invalid_response.
 * Does not invent facts; only fixes syntactic / shape issues that preserve meaning.
 */
export function repairAnalysisResponse(
  raw: unknown,
  envelope: AnalysisRequestEnvelope,
): { repaired: unknown; changes: string[] } {
  const changes: string[] = [];
  if (typeof raw === 'string') {
    try {
      raw = parseAnalysisResponseJson(raw);
      changes.push('parsed_string_payload');
    } catch {
      return { repaired: raw, changes };
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { repaired: raw, changes };
  }

  const obj = { ...(raw as Record<string, unknown>) };
  const allowed = new Set([
    'contractVersion', 'runId', 'prediction', 'confidence', 'recommendation', 'evidence', 'risks', 'rationaleSummary',
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      delete obj[key];
      changes.push(`stripped:${key}`);
    }
  }

  if (obj.contractVersion !== 'analysis-response.v1') {
    obj.contractVersion = 'analysis-response.v1';
    changes.push('contractVersion');
  }
  if (obj.runId !== envelope.runId) {
    obj.runId = envelope.runId;
    changes.push('runId');
  }

  const prediction = obj.prediction;
  if (prediction && typeof prediction === 'object' && !Array.isArray(prediction)) {
    const pred = { ...(prediction as Record<string, unknown>) };
    let outcomes = Array.isArray(pred.outcomes) ? [...pred.outcomes] : [];
    const byId = new Map<string, number>();
    for (const item of outcomes) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = String(row.outcomeId ?? '');
      const p = Number(row.probability);
      if (id && Number.isFinite(p)) byId.set(id, Math.min(1, Math.max(0, p)));
    }
    for (const expected of envelope.market.outcomes) {
      if (!byId.has(expected.outcomeId)) {
        byId.set(expected.outcomeId, 0);
        changes.push(`filled_outcome:${expected.outcomeId}`);
      }
    }
    let sum = [...byId.values()].reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      const even = 1 / Math.max(byId.size, 1);
      for (const key of byId.keys()) byId.set(key, even);
      changes.push('even_probabilities');
      sum = 1;
    } else if (Math.abs(sum - 1) > 0.001) {
      for (const [key, value] of byId) byId.set(key, value / sum);
      changes.push('renormalized_probabilities');
    }
    outcomes = envelope.market.outcomes.map((outcome) => ({
      outcomeId: outcome.outcomeId,
      probability: byId.get(outcome.outcomeId) ?? 0,
    }));
    pred.outcomes = outcomes;
    obj.prediction = pred;
  }

  const confidence = obj.confidence;
  if (confidence && typeof confidence === 'object' && !Array.isArray(confidence)) {
    const conf = { ...(confidence as Record<string, unknown>) };
    const score = Number(conf.score);
    if (!Number.isFinite(score)) {
      conf.score = 0.5;
      changes.push('confidence_score_default');
    } else {
      conf.score = Math.min(1, Math.max(0, score));
    }
    if (!['low', 'medium', 'high'].includes(String(conf.grade))) {
      const s = Number(conf.score);
      conf.grade = s >= 0.75 ? 'high' : s >= 0.55 ? 'medium' : 'low';
      changes.push('confidence_grade');
    }
    if (!Array.isArray(conf.reasonCodes)) {
      conf.reasonCodes = [];
      changes.push('confidence_reasonCodes');
    }
    obj.confidence = conf;
  }

  const recommendation = obj.recommendation;
  if (recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation)) {
    const rec = { ...(recommendation as Record<string, unknown>) };
    if (rec.action !== 'recommend_outcome' && rec.action !== 'pass') {
      rec.action = 'pass';
      rec.outcomeId = null;
      changes.push('recommendation_pass');
    }
    if (rec.action === 'pass') {
      rec.outcomeId = null;
    } else if (typeof rec.outcomeId !== 'string'
      || !envelope.market.outcomes.some((o) => o.outcomeId === rec.outcomeId)) {
      rec.action = 'pass';
      rec.outcomeId = null;
      changes.push('recommendation_invalid_outcome');
    }
    obj.recommendation = rec;
  }

  if (!Array.isArray(obj.evidence)) {
    obj.evidence = [];
    changes.push('evidence_empty');
  } else {
    const factIds = new Set(envelope.dataSnapshot.facts.map((f) => f.factId));
    obj.evidence = (obj.evidence as unknown[]).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      const ids = Array.isArray(row.factIds) ? row.factIds.map(String) : [];
      return ids.length > 0 && ids.every((id) => factIds.has(id));
    });
  }

  if (!Array.isArray(obj.risks)) {
    obj.risks = [];
    changes.push('risks_empty');
  }

  if (typeof obj.rationaleSummary !== 'string' || obj.rationaleSummary.length === 0) {
    obj.rationaleSummary = 'Repaired response with bounded local fixes.';
    changes.push('rationale_default');
  } else if (obj.rationaleSummary.length > 800) {
    obj.rationaleSummary = obj.rationaleSummary.slice(0, 800);
    changes.push('rationale_truncated');
  }

  return { repaired: obj, changes };
}

export function validateWithOptionalRepair(
  rawText: string,
  envelope: AnalysisRequestEnvelope,
  allowRepair: boolean,
): {
  validation: AnalysisValidationResult;
  rawParsed: unknown;
  repairAttempted: boolean;
  repairChanges: string[];
  effectiveRaw: string;
} {
  let rawParsed: unknown;
  let extractedFromNoise = false;
  try {
    rawParsed = parseAnalysisResponseJson(rawText);
  } catch (err) {
    if (!allowRepair) {
      return {
        validation: {
          ok: false,
          errors: [{ code: 'INVALID_JSON', path: '$', message: (err as Error).message }],
        },
        rawParsed: null,
        repairAttempted: false,
        repairChanges: [],
        effectiveRaw: rawText,
      };
    }
    // Try extracting the first JSON object from noisy provider text.
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        validation: {
          ok: false,
          errors: [{ code: 'INVALID_JSON', path: '$', message: (err as Error).message }],
        },
        rawParsed: null,
        repairAttempted: true,
        repairChanges: [],
        effectiveRaw: rawText,
      };
    }
    try {
      rawParsed = JSON.parse(match[0]);
      extractedFromNoise = true;
    } catch (inner) {
      return {
        validation: {
          ok: false,
          errors: [{ code: 'INVALID_JSON', path: '$', message: (inner as Error).message }],
        },
        rawParsed: null,
        repairAttempted: true,
        repairChanges: [],
        effectiveRaw: rawText,
      };
    }
  }

  let validation = validateAnalysisResponse(rawParsed, envelope);
  if (validation.ok) {
    return {
      validation,
      rawParsed,
      repairAttempted: extractedFromNoise,
      repairChanges: extractedFromNoise ? ['extracted_json_object'] : [],
      effectiveRaw: extractedFromNoise ? JSON.stringify(rawParsed) : rawText,
    };
  }
  if (!allowRepair) {
    return {
      validation,
      rawParsed,
      repairAttempted: extractedFromNoise,
      repairChanges: extractedFromNoise ? ['extracted_json_object'] : [],
      effectiveRaw: rawText,
    };
  }

  const { repaired, changes } = repairAnalysisResponse(rawParsed, envelope);
  validation = validateAnalysisResponse(repaired, envelope);
  return {
    validation,
    rawParsed: repaired,
    repairAttempted: true,
    repairChanges: [
      ...(extractedFromNoise ? ['extracted_json_object'] : []),
      ...changes,
    ],
    effectiveRaw: JSON.stringify(repaired),
  };
}

export type { AnalysisResponseV1 };
