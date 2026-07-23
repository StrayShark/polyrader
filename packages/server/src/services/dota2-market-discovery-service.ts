import {
  normalizeDotaTeamAlias,
  type Market,
  type NormalizedMatchFacts,
} from '@polyrader/core';
import { MarketRepository, PolymarketGammaClient } from '@polyrader/infra';

export interface DotaMarketDiscoveryResult {
  scanned: number;
  aligned: number;
  marketIds: string[];
  detail: string;
}

/** Public, read-only Polymarket discovery for one canonical future Dota series. */
export class Dota2MarketDiscoveryService {
  private readonly gamma: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
  private readonly markets: Pick<MarketRepository, 'upsert'>;

  constructor(deps?: {
    gamma?: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
    markets?: Pick<MarketRepository, 'upsert'>;
  }) {
    this.gamma = deps?.gamma ?? new PolymarketGammaClient();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  async discoverForFacts(facts: NormalizedMatchFacts): Promise<DotaMarketDiscoveryResult> {
    if (facts.game !== 'dota2' || facts.participants.length !== 2) {
      return { scanned: 0, aligned: 0, marketIds: [], detail: 'not a two-team Dota series' };
    }
    const candidates = await this.gamma.getMarketsForGame('dota2', 100, 0);
    const aligned = candidates.filter((market) => marketMatchesFacts(market, facts));
    const canonicalMatchId = `dota2:${facts.externalMatchId}`;
    for (const market of aligned) {
      this.markets.upsert({
        ...market,
        canonicalMatchId,
        tags: [...new Set([...market.tags, 'dota2', 'canonical-series', 'polymarket'])],
        match: {
          matchId: facts.externalMatchId,
          canonicalMatchId,
          teamA: {
            teamId: facts.participants[0].participantId,
            name: facts.participants[0].name,
            rank: facts.participants[0].rating ?? 0,
            logo: '',
            region: '',
          },
          teamB: {
            teamId: facts.participants[1].participantId,
            name: facts.participants[1].name,
            rank: facts.participants[1].rating ?? 0,
            logo: '',
            region: '',
          },
          eventName: facts.eventName,
          eventType: 'Online',
          format: facts.format,
          scheduledAt: facts.startsAt,
          status: 'scheduled',
          maps: [],
        },
      });
    }
    return {
      scanned: candidates.length,
      aligned: aligned.length,
      marketIds: aligned.map((market) => market.conditionId),
      detail:
        aligned.length > 0
          ? `${aligned.length}/${candidates.length} public Dota markets aligned`
          : `${candidates.length} public Dota markets scanned; no canonical series match`,
    };
  }
}

function marketMatchesFacts(market: Market, facts: NormalizedMatchFacts): boolean {
  if (market.status !== 'active') return false;
  const teamA = normalizeDotaTeamAlias(facts.participants[0].name);
  const teamB = normalizeDotaTeamAlias(facts.participants[1].name);
  const text = normalizeDotaTeamAlias(
    [market.question, market.description, ...market.outcomes].join(' '),
  );
  if (!teamA || !teamB || !text.includes(teamA) || !text.includes(teamB)) return false;

  const startsAt = Date.parse(facts.startsAt);
  const marketEnd = Date.parse(market.endDate);
  if (Number.isFinite(startsAt) && Number.isFinite(marketEnd)) {
    return Math.abs(startsAt - marketEnd) <= 36 * 60 * 60 * 1000;
  }
  return true;
}
