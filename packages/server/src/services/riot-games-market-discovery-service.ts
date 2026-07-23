import {
  classifySettledMarketKind,
  normalizeLolTeamAlias,
  normalizeValorantTeamAlias,
  type Market,
  type NormalizedMatchFacts,
} from '@polyrader/core';
import { MarketRepository, PolymarketGammaClient } from '@polyrader/infra';

export interface RiotMarketDiscoveryResult {
  scanned: number;
  aligned: number;
  marketIds: string[];
  detail: string;
  /** Board sample that received the upserted canonical markets, when any candidate aligned. */
  matchedExternalMatchId?: string;
}

/** Public, read-only Polymarket discovery for one LoL series. */
export class LolMarketDiscoveryService {
  private readonly gamma: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
  private readonly markets: Pick<MarketRepository, 'upsert' | 'findByTag'>;

  constructor(deps?: {
    gamma?: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
    markets?: Pick<MarketRepository, 'upsert' | 'findByTag'>;
  }) {
    this.gamma = deps?.gamma ?? new PolymarketGammaClient();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  async discoverForFacts(facts: NormalizedMatchFacts): Promise<RiotMarketDiscoveryResult> {
    return discoverForGame('lol', [facts], this.gamma, this.markets);
  }

  /** Prefer a board sample that actually appears on Polymarket among normalized candidates. */
  async discoverForCandidates(
    candidates: NormalizedMatchFacts[],
  ): Promise<RiotMarketDiscoveryResult> {
    return discoverForGame('lol', candidates, this.gamma, this.markets);
  }
}

/** Public, read-only Polymarket discovery for one Valorant series. */
export class ValorantMarketDiscoveryService {
  private readonly gamma: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
  private readonly markets: Pick<MarketRepository, 'upsert' | 'findByTag'>;

  constructor(deps?: {
    gamma?: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
    markets?: Pick<MarketRepository, 'upsert' | 'findByTag'>;
  }) {
    this.gamma = deps?.gamma ?? new PolymarketGammaClient();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  async discoverForFacts(facts: NormalizedMatchFacts): Promise<RiotMarketDiscoveryResult> {
    return discoverForGame('valorant', [facts], this.gamma, this.markets);
  }

  async discoverForCandidates(
    candidates: NormalizedMatchFacts[],
  ): Promise<RiotMarketDiscoveryResult> {
    return discoverForGame('valorant', candidates, this.gamma, this.markets);
  }
}

async function discoverForGame(
  game: 'lol' | 'valorant',
  factCandidates: NormalizedMatchFacts[],
  gamma: Pick<PolymarketGammaClient, 'getMarketsForGame'>,
  markets: Pick<MarketRepository, 'upsert' | 'findByTag'>,
): Promise<RiotMarketDiscoveryResult> {
  const series = factCandidates.filter(
    (facts) => facts.game === game && facts.participants.length === 2,
  );
  const label = game === 'lol' ? 'LoL' : 'Valorant';
  if (series.length === 0) {
    return {
      scanned: 0,
      aligned: 0,
      marketIds: [],
      detail: `not a two-team ${label} series`,
    };
  }
  const startedMs = Date.now();
  let remote: Market[] = [];
  let gammaFailure: string | undefined;
  try {
    remote = await gamma.getMarketsForGame(game, 100, 0);
  } catch (error) {
    gammaFailure = sanitizeDiscoveryError(error);
  }
  const local = ((await Promise.resolve(markets.findByTag(game, 200))) ?? []).filter((market) =>
    isGameCandidate(market, game),
  );
  const inventory = dedupeMarkets([...remote, ...local]);
  const ranked = series
    .map((facts) => ({
      facts,
      aligned: inventory.filter((market) => marketMatchesFacts(market, facts, game)),
    }))
    .sort((a, b) => {
      const aHit = a.aligned.length > 0 ? 1 : 0;
      const bHit = b.aligned.length > 0 ? 1 : 0;
      if (bHit !== aHit) return bHit - aHit;
      const completeness = (b.facts.completeness ?? 0) - (a.facts.completeness ?? 0);
      if (Math.abs(completeness) >= 0.05) return completeness > 0 ? 1 : -1;
      const roster = b.facts.players.length - a.facts.players.length;
      if (roster !== 0) return roster;
      const count = b.aligned.length - a.aligned.length;
      if (count !== 0) return count;
      const liq =
        b.aligned.reduce((sum, market) => sum + (market.liquidity ?? 0), 0) -
        a.aligned.reduce((sum, market) => sum + (market.liquidity ?? 0), 0);
      return liq;
    });
  const best = ranked[0];
  const facts = best.aligned.length > 0 ? best.facts : series[0];
  const aligned = best.aligned.length > 0 ? best.aligned : ranked[0]?.aligned ?? [];
  const canonicalMatchId = `${game}:${facts.externalMatchId}`;
  const elapsedMs = Date.now() - startedMs;
  for (const market of aligned) {
    markets.upsert({
      ...market,
      canonicalMatchId,
      tags: [...new Set([...market.tags, game, 'canonical-series', 'polymarket'])],
      match: {
        matchId: facts.externalMatchId,
        canonicalMatchId,
        teamA: brief(facts, 0),
        teamB: brief(facts, 1),
        eventName: facts.eventName,
        eventType: 'Online',
        format: facts.format,
        scheduledAt: facts.startsAt,
        status: 'scheduled',
        maps: [],
      },
    });
  }
  const sampleNote =
    aligned.length > 0 && facts.externalMatchId !== series[0]?.externalMatchId
      ? ` · sample ${facts.externalMatchId}`
      : '';
  return {
    scanned: inventory.length,
    aligned: aligned.length,
    marketIds: aligned.map((market) => market.conditionId),
    matchedExternalMatchId: aligned.length > 0 ? facts.externalMatchId : undefined,
    detail: gammaFailure
      ? `0 ${label} markets scanned (${elapsedMs}ms · gamma failed: ${gammaFailure} · ${local.length} local)`
      : aligned.length > 0
        ? `${aligned.length}/${inventory.length} ${label} markets aligned (${remote.length} gamma · ${local.length} local)${sampleNote}`
        : `${inventory.length} ${label} markets scanned (${remote.length} gamma · ${local.length} local · ${elapsedMs}ms); no canonical series match`,
  };
}

function sanitizeDiscoveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 180);
}

function brief(facts: NormalizedMatchFacts, index: 0 | 1) {
  return {
    teamId: facts.participants[index].participantId,
    name: facts.participants[index].name,
    rank: facts.participants[index].rating ?? 0,
    logo: '',
    region: '',
  };
}

function isGameCandidate(market: Market, game: 'lol' | 'valorant'): boolean {
  if (market.status !== 'active') return false;
  if (market.tags.includes('local-sim') || market.tags.includes('practice')) return false;
  const question = market.question.toLowerCase();
  if (game === 'lol') {
    return (
      question.includes('league of legends') ||
      question.includes('lol:') ||
      question.startsWith('lol ') ||
      market.tags.includes('lol')
    );
  }
  return (
    question.includes('valorant') || question.includes('vct') || market.tags.includes('valorant')
  );
}

function dedupeMarkets(markets: Market[]): Market[] {
  const unique = new Map<string, Market>();
  for (const market of markets) {
    if (!unique.has(market.conditionId)) unique.set(market.conditionId, market);
  }
  return [...unique.values()];
}

function marketMatchesFacts(
  market: Market,
  facts: NormalizedMatchFacts,
  game: 'lol' | 'valorant',
): boolean {
  if (market.status !== 'active') return false;
  if (!isDiscoverableSeriesMarket(market.question)) return false;
  const normalizeName = game === 'lol' ? normalizeLolTeamAlias : normalizeValorantTeamAlias;
  const teamA = normalizeName(facts.participants[0].name);
  const teamB = normalizeName(facts.participants[1].name);
  // Question + outcomes only: prop markets often inherit a parent description that names both teams.
  const haystack = [market.question, ...market.outcomes].join(' ');
  const text = normalizeName(haystack);
  if (!teamA || !teamB || !text.includes(teamA) || !text.includes(teamB)) return false;
  if (!aliasAppearsAsToken(haystack, teamA) || !aliasAppearsAsToken(haystack, teamB)) return false;
  const startsAt = Date.parse(facts.startsAt);
  const marketEnd = Date.parse(market.endDate);
  if (Number.isFinite(startsAt) && Number.isFinite(marketEnd)) {
    return Math.abs(startsAt - marketEnd) <= 36 * 60 * 60 * 1000;
  }
  return true;
}

/** Prefer token hits so short aliases like "BIG" do not match arbitrary substrings. */
function aliasAppearsAsToken(haystack: string, alias: string): boolean {
  if (alias.length >= 4) return true;
  const spaced = haystack
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return new RegExp(`(?:^| )${escapeRegExp(alias)}(?: |$)`).test(` ${spaced} `);
}

/** Match-winner / map-winner / handicap / totals only — ignore Baron/kill props and orphan O/U rows. */
export function isDiscoverableSeriesMarket(question: string): boolean {
  const kind = classifySettledMarketKind(question);
  return kind === 'match_winner' || kind === 'map_winner' || kind === 'handicap' || kind === 'total_maps';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
