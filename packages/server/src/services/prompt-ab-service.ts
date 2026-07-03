import { applyPromptTrafficShift } from '@polyrader/core';
import type { PromptVariant } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function chiSquareCdf(df: number, x: number): number {
  if (x <= 0) return 0;
  const h = 2 / (9 * df);
  const z = (Math.pow(x / df, 1 / 3) - (1 - h)) / Math.sqrt(h);
  return normalCdf(z);
}

export function getAbRecommendation(
  pValue: number,
  chiSqPValue: number,
  bayesProbABetter: number,
  hasSufficientData: boolean,
  pA: number,
  pB: number,
): string {
  if (!hasSufficientData) return 'insufficient_data';
  const bothSignificant = pValue < 0.05 && chiSqPValue < 0.05;
  const bayesStrong = bayesProbABetter > 0.9 || bayesProbABetter < 0.1;

  if (bothSignificant || bayesStrong) {
    if (pA > pB && bayesProbABetter > 0.5) return 'promote_variant_a';
    if (pB > pA && bayesProbABetter < 0.5) return 'promote_variant_b';
  }
  return 'no_significant_difference';
}

export interface AbCompareResult {
  variantA: ReturnType<LLMRepository['getVariantStats']>;
  variantB: ReturnType<LLMRepository['getVariantStats']>;
  significance: {
    zScore: number;
    pValue: number;
    isSignificant: boolean;
    hasSufficientData: boolean;
    minSampleSize: number;
    settledA: number;
    settledB: number;
    chiSquare: number;
    chiSqPValue: number;
    bayesProbABetter: number;
    bayesProbBBetter: number;
    recommendation: string;
  };
}

export function comparePromptVariants(
  llmRepo: LLMRepository,
  variantA: string,
  variantB: string,
  minSampleSize = 30,
): AbCompareResult {
  const statsA = llmRepo.getVariantStats(variantA);
  const statsB = llmRepo.getVariantStats(variantB);

  const settledA = statsA.wonBets + statsA.lostBets;
  const settledB = statsB.wonBets + statsB.lostBets;
  const pA = settledA > 0 ? statsA.wonBets / settledA : 0;
  const pB = settledB > 0 ? statsB.wonBets / settledB : 0;
  const pooled = settledA + settledB > 0
    ? (statsA.wonBets + statsB.wonBets) / (settledA + settledB)
    : 0;
  const se = pooled > 0 && pooled < 1
    ? Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(1, settledA) + 1 / Math.max(1, settledB)))
    : 0;
  const zScore = se > 0 ? Math.abs(pA - pB) / se : 0;
  const pValue = zScore > 0 ? 2 * (1 - normalCdf(zScore)) : 1;
  const hasSufficientData = settledA >= minSampleSize && settledB >= minSampleSize;

  const a = statsA.wonBets;
  const b = statsA.lostBets;
  const c = statsB.wonBets;
  const d = statsB.lostBets;
  const nA = a + b;
  const nB = c + d;
  const n = nA + nB;
  const colWon = a + c;
  const colLost = b + d;
  const chiSq = n > 0 && colWon > 0 && colLost > 0
    ? n * Math.pow(Math.abs(a * d - b * c) - n / 2, 2) / (Math.max(1, nA) * Math.max(1, nB) * Math.max(1, colWon) * Math.max(1, colLost))
    : 0;
  const chiSqPValue = chiSq > 0 ? 1 - chiSquareCdf(1, chiSq) : 1;

  const alphaA = 1 + a;
  const betaA = 1 + b;
  const alphaB = 1 + c;
  const betaB = 1 + d;
  const meanA = alphaA / (alphaA + betaA);
  const meanB = alphaB / (alphaB + betaB);
  const varA = (alphaA * betaA) / (Math.pow(alphaA + betaA, 2) * (alphaA + betaA + 1));
  const varB = (alphaB * betaB) / (Math.pow(alphaB + betaB, 2) * (alphaB + betaB + 1));
  const bayesSe = Math.sqrt(varA + varB);
  const bayesZ = bayesSe > 0 ? (meanA - meanB) / bayesSe : 0;
  const probABetter = Number.isFinite(bayesZ) ? normalCdf(bayesZ) : 0.5;

  const recommendation = getAbRecommendation(
    pValue,
    chiSqPValue,
    probABetter,
    hasSufficientData,
    pA,
    pB,
  );

  return {
    variantA: statsA,
    variantB: statsB,
    significance: {
      zScore: Number.isFinite(zScore) ? Math.round(zScore * 1000) / 1000 : 0,
      pValue: Number.isFinite(pValue) ? Math.round(pValue * 10000) / 10000 : 1,
      isSignificant: pValue < 0.05 && hasSufficientData,
      hasSufficientData,
      minSampleSize,
      settledA,
      settledB,
      chiSquare: Number.isFinite(chiSq) ? Math.round(chiSq * 1000) / 1000 : 0,
      chiSqPValue: Number.isFinite(chiSqPValue) ? Math.round(chiSqPValue * 10000) / 10000 : 1,
      bayesProbABetter: Number.isFinite(probABetter) ? Math.round(probABetter * 10000) / 10000 : 0.5,
      bayesProbBBetter: Number.isFinite(probABetter) ? Math.round((1 - probABetter) * 10000) / 10000 : 0.5,
      recommendation,
    },
  };
}

export function applyAbRecommendation(
  llmRepo: LLMRepository,
  variantA: string,
  variantB: string,
  boostRatio = 0.15,
): { applied: boolean; recommendation: string; updated?: PromptVariant[] } {
  const comparison = comparePromptVariants(llmRepo, variantA, variantB);
  const { recommendation } = comparison.significance;

  if (recommendation !== 'promote_variant_a' && recommendation !== 'promote_variant_b') {
    return { applied: false, recommendation };
  }

  const winnerId = recommendation === 'promote_variant_a' ? variantA : variantB;
  const loserId = recommendation === 'promote_variant_a' ? variantB : variantA;
  const variants = llmRepo.getAllVariants();
  const shift = applyPromptTrafficShift(variants, winnerId, loserId, boostRatio);
  if (!shift) {
    return { applied: false, recommendation };
  }

  for (const variant of shift.variants) {
    if (variant.variantId === winnerId || variant.variantId === loserId) {
      llmRepo.upsertVariant(variant);
    }
  }

  return {
    applied: true,
    recommendation,
    updated: llmRepo.getAllVariants(),
  };
}

export function autoTunePromptVariants(
  llmRepo: LLMRepository,
  boostRatio = 0.15,
): { applied: number; results: Array<{ variantA: string; variantB: string; recommendation: string; applied: boolean }> } {
  const enabled = llmRepo.getEnabledVariants();
  const control = enabled.find((v) => v.isControl) ?? enabled[0];
  if (!control) return { applied: 0, results: [] };

  const results: Array<{ variantA: string; variantB: string; recommendation: string; applied: boolean }> = [];
  let applied = 0;

  for (const challenger of enabled) {
    if (challenger.variantId === control.variantId) continue;
    const result = applyAbRecommendation(llmRepo, control.variantId, challenger.variantId, boostRatio);
    results.push({
      variantA: control.variantId,
      variantB: challenger.variantId,
      recommendation: result.recommendation,
      applied: result.applied,
    });
    if (result.applied) applied += 1;
  }

  return { applied, results };
}
