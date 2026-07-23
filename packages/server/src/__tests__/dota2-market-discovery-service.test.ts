import { describe, expect, it, vi } from 'vitest';
import { buildDota2FixtureFacts, type Market } from '@polyrader/core';
import { Dota2MarketDiscoveryService } from '../services/dota2-market-discovery-service';

describe('Dota public market discovery', () => {
  it('persists only a same-team, same-time market under the canonical series', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildDota2FixtureFacts(now);
    const upsert = vi.fn();
    const matching = market({
      conditionId: 'dota-real-1',
      question: 'Dota 2: Team Liquid vs Team Falcons - Match Winner',
      outcomes: ['Team Liquid', 'Team Falcons'],
      endDate: facts.startsAt,
    });
    const unrelated = market({
      conditionId: 'dota-other',
      question: 'Dota 2: Aurora vs Xtreme Gaming - Match Winner',
      outcomes: ['Aurora', 'Xtreme Gaming'],
      endDate: facts.startsAt,
    });
    const service = new Dota2MarketDiscoveryService({
      gamma: { getMarketsForGame: vi.fn().mockResolvedValue([matching, unrelated]) },
      markets: { upsert },
    });

    const result = await service.discoverForFacts(facts);

    expect(result).toMatchObject({ scanned: 2, aligned: 1, marketIds: ['dota-real-1'] });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalMatchId: 'dota2:8906069414' }),
    );
  });
});

function market(overrides: Partial<Market>): Market {
  return {
    conditionId: 'dota-market',
    slug: 'dota-market',
    question: 'Dota 2 market',
    description: '',
    outcomes: ['A', 'B'],
    outcomePrices: ['0.5', '0.5'],
    volume: 1_000,
    volume24h: 100,
    liquidity: 2_000,
    startDate: '2026-07-23T00:00:00.000Z',
    endDate: '2026-07-23T14:00:00.000Z',
    status: 'active',
    tags: ['dota2'],
    ...overrides,
  };
}
