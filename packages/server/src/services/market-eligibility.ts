import type { Market } from '@polyrader/core';

const PREMATCH_GRACE_MS = 15 * 60 * 1000;
const END_DATE_GRACE_MS = 5 * 60 * 1000;
const TERMINAL_MATCH_STATUSES = new Set(['finished', 'settled', 'cancelled']);
const LIVE_MATCH_STATUSES = new Set(['live', 'in_progress', 'running']);

export function isOpenMarket(market: Market, now = new Date()): boolean {
  if (market.status && market.status !== 'active') return false;
  if (market.resolvedOutcome !== undefined || market.resolvedPrice !== undefined) return false;

  const endMs = Date.parse(market.endDate ?? '');
  if (!Number.isFinite(endMs)) return true;

  return endMs >= now.getTime() - END_DATE_GRACE_MS;
}

/**
 * Lobby list eligibility: keep open markets that are live or still inside the
 * shared 15-minute prematch grace window. Stale scheduled rows with match
 * metadata are hidden even when Polymarket endDate remains in the future.
 */
export function isLobbyVisibleMarket(market: Market, now = new Date()): boolean {
  if (!isOpenMarket(market, now)) return false;

  const match = market.match;
  if (!match) return true;

  const status = String(match.status ?? '').toLowerCase();
  if (TERMINAL_MATCH_STATUSES.has(status)) return false;
  if (LIVE_MATCH_STATUSES.has(status)) return true;

  const startsAt = Date.parse(match.scheduledAt ?? '');
  if (!Number.isFinite(startsAt)) return true;
  return startsAt >= now.getTime() - PREMATCH_GRACE_MS;
}
