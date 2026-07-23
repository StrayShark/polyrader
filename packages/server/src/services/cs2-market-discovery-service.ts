import { normalizeTeamName, type Market, type NormalizedMatchFacts } from '@polyrader/core';
import { MarketRepository, PolymarketGammaClient } from '@polyrader/infra';

export interface Cs2MarketDiscoveryResult {
  scanned: number;
  aligned: number;
  marketIds: string[];
  detail: string;
}

/** Public, read-only Polymarket discovery for one current HLTV CS2 series. */
export class Cs2MarketDiscoveryService {
  private readonly gamma: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
  private readonly markets: Pick<MarketRepository, 'upsert' | 'findAll'>;

  constructor(deps?: {
    gamma?: Pick<PolymarketGammaClient, 'getMarketsForGame'>;
    markets?: Pick<MarketRepository, 'upsert' | 'findAll'>;
  }) {
    this.gamma = deps?.gamma ?? new PolymarketGammaClient();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  async discoverForFacts(facts: NormalizedMatchFacts): Promise<Cs2MarketDiscoveryResult> {
    if (facts.game !== 'cs2' || facts.participants.length !== 2) {
      return { scanned: 0, aligned: 0, marketIds: [], detail: 'not a two-team CS2 series' };
    }
    const remote = await this.gamma.getMarketsForGame('cs2', 100, 0);
    const local = ((await Promise.resolve(this.markets.findAll(200, 0))) ?? []).filter(
      isCs2Candidate,
    );
    const candidates = dedupeMarkets([...remote, ...local]);
    const aligned = candidates.filter((market) => marketMatchesFacts(market, facts));
    const canonicalMatchId = `hltv:${facts.externalMatchId}`;
    for (const market of aligned) {
      this.markets.upsert({
        ...market,
        canonicalMatchId,
        tags: [...new Set([...market.tags, 'cs2', 'canonical-series', 'polymarket'])],
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
          ? `${aligned.length}/${candidates.length} CS2 markets aligned (${remote.length} gamma · ${local.length} local)`
          : `${candidates.length} CS2 markets scanned (${remote.length} gamma · ${local.length} local); no canonical series match`,
    };
  }
}

function isCs2Candidate(market: Market): boolean {
  if (market.status !== 'active') return false;
  if (market.tags.includes('local-sim') || market.tags.includes('practice')) return false;
  const question = market.question.toLowerCase();
  return (
    question.startsWith('counter-strike') || question.includes('cs2') || question.includes('csgo')
  );
}

function dedupeMarkets(markets: Market[]): Market[] {
  const unique = new Map<string, Market>();
  for (const market of markets) {
    if (!unique.has(market.conditionId)) unique.set(market.conditionId, market);
  }
  return [...unique.values()];
}

function marketMatchesFacts(market: Market, facts: NormalizedMatchFacts): boolean {
  if (market.status !== 'active') return false;
  const teamA = normalizeTeamName(facts.participants[0].name);
  const teamB = normalizeTeamName(facts.participants[1].name);
  const text = normalizeTeamName(
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
