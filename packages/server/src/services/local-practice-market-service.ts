import { findSettlementRule, type Market, type NormalizedMatchFacts } from '@polyrader/core';
import { MarketRepository } from '@polyrader/infra';
import { buildMultigamePracticeMarkets } from './local-simulation-market';

/** Persists explicit local-sim markets without inventing volume or liquidity. */
export class LocalPracticeMarketService {
  private readonly markets: Pick<
    MarketRepository,
    'findByCanonicalMatchId' | 'upsert' | 'insertPriceHistoryIfChanged'
  >;

  constructor(deps?: {
    markets?: Pick<
      MarketRepository,
      'findByCanonicalMatchId' | 'upsert' | 'insertPriceHistoryIfChanged'
    >;
  }) {
    this.markets = deps?.markets ?? new MarketRepository();
  }

  ensureForFacts(facts: NormalizedMatchFacts): Market | null {
    if (facts.participants.length !== 2) return null;
    if (!['scheduled', 'upcoming', 'pre_match'].includes(facts.status)) return null;
    if (Date.parse(facts.startsAt) < Date.now()) return null;
    if (!findSettlementRule(facts.game, 'match_winner')?.supported) return null;

    const canonicalMatchId =
      facts.game === 'cs2'
        ? `hltv:${facts.externalMatchId}`
        : `${facts.game}:${facts.externalMatchId}`;
    const existing = new Map(
      this.markets
        .findByCanonicalMatchId(canonicalMatchId)
        .filter((market) => market.tags.includes('local-sim'))
        .map((market) => [market.conditionId, market]),
    );
    const generated = buildMultigamePracticeMarkets(facts);
    for (const market of generated) {
      if (existing.has(market.conditionId)) continue;
      this.markets.upsert(market);
      this.markets.insertPriceHistoryIfChanged(market.conditionId, 0.5);
    }
    return existing.get(generated[0].conditionId) ?? generated[0];
  }
}
