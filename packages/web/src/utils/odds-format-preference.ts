import type { OddsFormat } from './bet-math';

export const ODDS_FORMAT_KEY = 'polyrader-odds-format';

export function readOddsFormatPreference(): OddsFormat {
  if (typeof localStorage === 'undefined') return 'decimal';
  const saved = localStorage.getItem(ODDS_FORMAT_KEY);
  return isOddsFormat(saved) ? saved : 'decimal';
}

export function writeOddsFormatPreference(format: OddsFormat): void {
  localStorage.setItem(ODDS_FORMAT_KEY, format);
}

function isOddsFormat(value: string | null): value is OddsFormat {
  return value === 'decimal' || value === 'probability' || value === 'american';
}
