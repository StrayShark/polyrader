/**
 * Pure math helpers for simulation betting.
 * No I/O, no side effects — safe to use in both core and server tests.
 */

export function oddsToImpliedProbability(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 0) return 0;
  return 1 / odds;
}

export function impliedProbabilityToOdds(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return 0;
  return 1 / probability;
}

export function calculateEdge(userProbability: number, marketProbability: number): number {
  return userProbability - marketProbability;
}

export function calculateEv(stake: number, userProbability: number, odds: number): number {
  return stake * (userProbability * (odds - 1) - (1 - userProbability));
}

export function calculateKellyFraction(userProbability: number, marketProbability: number): number {
  if (userProbability <= 0 || marketProbability <= 0 || marketProbability >= 1) return 0;
  // Kelly = (bp - q) / b, where b = odds - 1, p = userProbability, q = 1 - p
  const b = 1 / marketProbability - 1;
  const q = 1 - userProbability;
  const fraction = (b * userProbability - q) / b;
  return Math.max(0, fraction);
}

export function calculateStakeFromRiskFraction(bankroll: number, fraction: number): number {
  return bankroll * Math.max(0, Math.min(1, fraction));
}

export function calculatePotentialReturn(stake: number, odds: number): number {
  return stake * odds;
}

export function calculatePotentialPnl(stake: number, odds: number): number {
  return stake * (odds - 1);
}

export function calculateBrierScore(probability: number, outcome: 0 | 1): number {
  return Math.pow(probability - outcome, 2);
}

export function calculateClosingLineValue(entryOdds: number, closingOdds: number): number {
  // Positive CLV means you got better odds than the closing line.
  if (!Number.isFinite(entryOdds) || !Number.isFinite(closingOdds) || closingOdds <= 1) {
    return 0;
  }
  return entryOdds / closingOdds - 1;
}

export function americanToDecimal(american: number): number {
  if (american === 0) return 0;
  if (american > 0) {
    return 1 + american / 100;
  }
  return 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

export function formatProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatOdds(value: number): string {
  return value.toFixed(2);
}
