import { describe, expect, it, vi } from 'vitest';
import { buildCs2FixtureFacts, type Market } from '@polyrader/core';
import { Cs2MarketDiscoveryService } from '../services/cs2-market-discovery-service';

describe('CS2 public market discovery', () => {
  it('persists only a same-team, same-time market under the HLTV canonical id', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildCs2FixtureFacts(now);
    const upsert = vi.fn();
    const matching = market({
      conditionId: 'cs2-real-1',
      question: `Counter-Strike: ${facts.participants[0].name} vs ${facts.participants[1].name} (BO3)`,
      outcomes: [facts.participants[0].name, facts.participants[1].name],
      endDate: facts.startsAt,
    });
    const unrelated = market({
      conditionId: 'cs2-other',
      question: 'Counter-Strike: Vitality vs Falcons (BO3)',
      outcomes: ['Vitality', 'Falcons'],
      endDate: facts.startsAt,
    });
    const service = new Cs2MarketDiscoveryService({
      gamma: { getMarketsForGame: vi.fn().mockResolvedValue([matching, unrelated]) },
      markets: { upsert, findAll: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForFacts(facts);

    expect(result).toMatchObject({ scanned: 2, aligned: 1, marketIds: ['cs2-real-1'] });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalMatchId: `hltv:${facts.externalMatchId}` }),
    );
  });

  it('falls back to persisted non-practice markets when Gamma returns none', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildCs2FixtureFacts(now);
    const upsert = vi.fn();
    const persisted = market({
      conditionId: 'cs2-db-1',
      question: `Counter-Strike: ${facts.participants[0].name} Gaming vs ${facts.participants[1].name} (BO3)`,
      outcomes: [facts.participants[0].name, facts.participants[1].name],
      endDate: facts.startsAt,
      liquidity: 12_000,
      tags: ['cs2', 'polymarket'],
    });
    const service = new Cs2MarketDiscoveryService({
      gamma: { getMarketsForGame: vi.fn().mockResolvedValue([]) },
      markets: { upsert, findAll: vi.fn().mockReturnValue([persisted]) },
    });

    const result = await service.discoverForFacts(facts);

    expect(result.aligned).toBe(1);
    expect(result.marketIds).toEqual(['cs2-db-1']);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionId: 'cs2-db-1',
        canonicalMatchId: `hltv:${facts.externalMatchId}`,
        liquidity: 12_000,
      }),
    );
  });
});

function market(overrides: Partial<Market>): Market {
  return {
    conditionId: 'cs2-market',
    slug: 'cs2-market',
    question: 'Counter-Strike market',
    description: '',
    outcomes: ['A', 'B'],
    outcomePrices: ['0.5', '0.5'],
    volume: 1_000,
    volume24h: 100,
    liquidity: 2_000,
    startDate: '2026-07-23T00:00:00.000Z',
    endDate: '2026-07-23T14:00:00.000Z',
    status: 'active',
    tags: ['cs2'],
    ...overrides,
  };
}
