import type { Market } from '@polyrader/core';

export function isOpenMarket(market: Market, now = new Date()): boolean {
  if (market.status && market.status !== 'active') return false;
  if (market.resolvedOutcome !== undefined || market.resolvedPrice !== undefined) return false;

  const endMs = Date.parse(market.endDate ?? '');
  if (!Number.isFinite(endMs)) return true;

  return endMs >= now.getTime() - 5 * 60 * 1000;
}
