const PREMATCH_STATUSES = new Set(['scheduled', 'upcoming', 'pre_match', 'prematch', 'not_started']);
const LIVE_STATUSES = new Set(['live', 'in_progress', 'running']);
const TERMINAL_STATUSES = new Set(['finished', 'settled', 'cancelled']);
const PREMATCH_GRACE_MS = 15 * 60 * 1000;
const RESOLVED_PRICE_EDGE = 0.005;

export function isPrematchAnalysisEligible(
  status: string,
  startsAt: string,
  nowMs = Date.now(),
): boolean {
  if (!PREMATCH_STATUSES.has(status.toLowerCase())) return false;
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp >= nowMs - PREMATCH_GRACE_MS;
}

/** Client-side lobby defense matching the server 15-minute prematch tolerance. */
export function isLobbyVisibleMatch(
  status: string | undefined,
  scheduledAt: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!status && !scheduledAt) return true;
  const normalized = String(status ?? '').toLowerCase();
  if (TERMINAL_STATUSES.has(normalized)) return false;
  if (LIVE_STATUSES.has(normalized)) return true;
  if (!scheduledAt) return true;
  const timestamp = Date.parse(scheduledAt);
  return Number.isFinite(timestamp) && timestamp >= nowMs - PREMATCH_GRACE_MS;
}

/** Extreme two-way prices are treated as a closed or already resolved market in the lobby. */
export function hasDisplayableTwoWayPrices(outcomePrices: readonly string[]): boolean {
  if (outcomePrices.length < 2) return false;
  const prices = outcomePrices.slice(0, 2).map(Number);
  return prices.every(
    (price) =>
      Number.isFinite(price) &&
      price > RESOLVED_PRICE_EDGE &&
      price < 1 - RESOLVED_PRICE_EDGE,
  );
}
