import type {
  PromptVariant,
  SignalBacktestMetric,
  SignalBacktestSourceKind,
  SignalSourceWeights,
} from '../types/index';

const SOURCE_TO_WEIGHT_KEY: Partial<Record<SignalBacktestSourceKind, keyof SignalSourceWeights>> = {
  prediction_model: 'prediction_model',
  market_behavior: 'market_behavior',
  ai_debate: 'ai_debate',
  smart_wallet: 'smart_wallet',
  community: 'community',
  market: 'polymarket',
};

export interface ApplySignalWeightOptions {
  minSampleSize?: number;
  maxStepRatio?: number;
}

export function buildSignalWeightUpdates(
  metrics: SignalBacktestMetric[],
  options: ApplySignalWeightOptions = {},
): Partial<SignalSourceWeights> {
  const minSampleSize = options.minSampleSize ?? 10;
  const maxStepRatio = options.maxStepRatio ?? 0.5;
  const updates: Partial<SignalSourceWeights> = {};

  for (const metric of metrics) {
    const key = SOURCE_TO_WEIGHT_KEY[metric.source];
    if (!key || metric.suggestedWeight === undefined || metric.currentWeight === undefined) continue;
    if (metric.sampleSize < minSampleSize) continue;

    const delta = metric.suggestedWeight - metric.currentWeight;
    const maxStep = Math.abs(metric.currentWeight * maxStepRatio);
    const clampedDelta = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
    updates[key] = Math.max(0, round4(metric.currentWeight + clampedDelta));
  }

  return updates;
}

export interface PromptTrafficShiftResult {
  winnerId: string;
  loserId: string;
  variants: PromptVariant[];
}

export function applyPromptTrafficShift(
  variants: PromptVariant[],
  winnerId: string,
  loserId: string,
  boostRatio = 0.15,
): PromptTrafficShiftResult | null {
  const winner = variants.find((v) => v.variantId === winnerId);
  const loser = variants.find((v) => v.variantId === loserId);
  if (!winner || !loser) return null;

  const updated = variants.map((v) => ({ ...v }));
  const w = updated.find((v) => v.variantId === winnerId)!;
  const l = updated.find((v) => v.variantId === loserId)!;

  const boost = Math.max(w.trafficWeight * boostRatio, 0.05);
  w.trafficWeight = round4(w.trafficWeight + boost);
  l.trafficWeight = round4(Math.max(0.05, l.trafficWeight - boost));

  return { winnerId, loserId, variants: updated };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
