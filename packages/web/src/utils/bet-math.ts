/**
 * Browser-safe copies of bet math helpers from @polyrader/core.
 * Kept separate to avoid pulling Node-only core engines into the web bundle.
 */

export function oddsToImpliedProbability(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 0) return 0;
  return 1 / odds;
}

export function calculateEdge(userProbability: number, marketProbability: number): number {
  if (!Number.isFinite(userProbability) || !Number.isFinite(marketProbability)) return 0;
  return userProbability - marketProbability;
}

export function calculateEv(stake: number, userProbability: number, odds: number): number {
  return stake * (userProbability * (odds - 1) - (1 - userProbability));
}

export function formatProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatOdds(value: number): string {
  return value.toFixed(2);
}

export function formatAmericanOdds(decimalOdds: number): string {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return '-';
  if (decimalOdds >= 2) {
    return `+${Math.round((decimalOdds - 1) * 100)}`;
  }
  return `${Math.round(-100 / (decimalOdds - 1))}`;
}

export type OddsFormat = 'decimal' | 'probability' | 'american';

export function formatOddsByFormat(value: number, format: OddsFormat): string {
  switch (format) {
    case 'probability':
      return formatProbability(oddsToImpliedProbability(value));
    case 'american':
      return formatAmericanOdds(value);
    case 'decimal':
    default:
      return formatOdds(value);
  }
}
