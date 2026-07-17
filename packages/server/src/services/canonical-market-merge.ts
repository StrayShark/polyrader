import type { Market, MatchInfo } from '@polyrader/core';
import { buildCanonicalMatchId, normalizeMatchToken, parsePolymarketMatch } from '@polyrader/core';

export function withCanonicalMarketId(market: Market): Market {
  if (market.canonicalMatchId && market.match?.canonicalMatchId) return market;
  const parsed = parsePolymarketMatch(market.question);
  const hltvMatchId = market.conditionId.match(/^local-hltv-(\d+)$/)?.[1]
    ?? market.match?.matchId.match(/^local-hltv-(\d+)$/)?.[1];
  if (!market.match && !parsed && !hltvMatchId) return market;
  const canonicalMatchId = market.canonicalMatchId ?? market.match?.canonicalMatchId ?? buildCanonicalMatchId({
    hltvMatchId,
    teamAId: market.match?.teamA.teamId,
    teamBId: market.match?.teamB.teamId,
    teamAName: market.match?.teamA.name ?? parsed?.teamAName,
    teamBName: market.match?.teamB.name ?? parsed?.teamBName,
    eventName: market.match?.eventName ?? parsed?.eventName,
    scheduledAt: market.match?.scheduledAt ?? market.startDate ?? market.endDate,
  });
  return {
    ...market,
    canonicalMatchId,
    match: market.match ? { ...market.match, canonicalMatchId } : market.match,
  };
}

/** Merge provider records for the same series while retaining distinct map/prop markets. */
export function mergeCanonicalMarkets(markets: Market[]): Market[] {
  if (markets.length <= 1) return markets;
  const groups = new Map<string, Market>();
  for (const raw of markets.map(withCanonicalMarketId)) {
    const scope = marketScope(raw);
    if (!raw.canonicalMatchId) {
      groups.set(`provider:${raw.conditionId}|${scope}`, raw);
      continue;
    }
    let canonicalMatchId = raw.canonicalMatchId;
    if (scope === 'series-winner') {
      const fuzzy = [...groups.values()].find((existing) =>
        marketScope(existing) === scope && likelySameSeries(existing, raw));
      if (fuzzy) canonicalMatchId = preferredCanonicalId(fuzzy.canonicalMatchId!, canonicalMatchId);
    }
    const market = {
      ...raw,
      canonicalMatchId,
      match: raw.match ? { ...raw.match, canonicalMatchId } : undefined,
    };
    const key = `${canonicalMatchId}|${scope}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, market);
      continue;
    }
    groups.set(key, mergePair(existing, market));
  }
  return [...groups.values()].sort((a, b) => {
    const aTime = Date.parse(a.match?.scheduledAt ?? a.startDate ?? '') || Number.MAX_SAFE_INTEGER;
    const bTime = Date.parse(b.match?.scheduledAt ?? b.startDate ?? '') || Number.MAX_SAFE_INTEGER;
    return aTime - bTime || b.volume24h - a.volume24h;
  });
}

function mergePair(left: Market, right: Market): Market {
  const leftReal = (left.clobTokenIds?.length ?? 0) > 0;
  const rightReal = (right.clobTokenIds?.length ?? 0) > 0;
  const primary = rightReal && !leftReal
    ? right
    : leftReal && !rightReal
      ? left
      : right.volume24h > left.volume24h ? right : left;
  const secondary = primary === left ? right : left;
  const match = richerMatch(primary.match, secondary.match);
  return {
    ...primary,
    canonicalMatchId: preferredCanonicalId(left.canonicalMatchId!, right.canonicalMatchId!),
    tags: [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])],
    match,
  };
}

function richerMatch(a: MatchInfo | undefined, b: MatchInfo | undefined): MatchInfo | undefined {
  if (!a) return b;
  if (!b) return a;
  const score = (match: MatchInfo) =>
    (match.teamDetails?.isComplete ? 100 : match.teamDetails ? 40 : 0)
    + (match.lineups?.teamA.players.length ?? 0)
    + (match.lineups?.teamB.players.length ?? 0)
    + (match.teamA.rank > 0 && match.teamA.rank < 500 ? 5 : 0)
    + (match.teamB.rank > 0 && match.teamB.rank < 500 ? 5 : 0);
  return score(b) > score(a) ? b : a;
}

function marketScope(market: Market): string {
  const parsed = parsePolymarketMatch(market.question);
  if (parsed?.isMapMarket) return `map-${parsed.mapNumber}`;
  if (/\b(handicap|spread|total|rounds?|correct\s+score|scoreline|pistol)\b/i.test(market.question)) {
    return `prop-${market.conditionId}`;
  }
  return parsed ? 'series-winner' : `other-${market.conditionId}`;
}

function likelySameSeries(a: Market, b: Market): boolean {
  const parsedA = parsePolymarketMatch(a.question);
  const parsedB = parsePolymarketMatch(b.question);
  const teamsA = teamTokens(a, parsedA).sort().join('|');
  const teamsB = teamTokens(b, parsedB).sort().join('|');
  if (!teamsA || teamsA !== teamsB) return false;
  const eventA = normalizeMatchToken(a.match?.eventName ?? parsedA?.eventName ?? '');
  const eventB = normalizeMatchToken(b.match?.eventName ?? parsedB?.eventName ?? '');
  if (eventA && eventB && !eventA.includes(eventB) && !eventB.includes(eventA)) return false;
  const timeA = Date.parse(a.match?.scheduledAt ?? a.startDate ?? '');
  const timeB = Date.parse(b.match?.scheduledAt ?? b.startDate ?? '');
  return !Number.isFinite(timeA) || !Number.isFinite(timeB) || Math.abs(timeA - timeB) <= 12 * 60 * 60 * 1000;
}

function teamTokens(market: Market, parsed: ReturnType<typeof parsePolymarketMatch>): string[] {
  return [
    normalizeMatchToken(market.match?.teamA.name ?? parsed?.teamAName ?? ''),
    normalizeMatchToken(market.match?.teamB.name ?? parsed?.teamBName ?? ''),
  ].filter(Boolean);
}

function preferredCanonicalId(a: string, b: string): string {
  if (a.startsWith('hltv:')) return a;
  if (b.startsWith('hltv:')) return b;
  return a;
}
