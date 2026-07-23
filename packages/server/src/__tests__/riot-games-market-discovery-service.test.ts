import { describe, expect, it, vi } from 'vitest';
import { buildLolFixtureFacts, buildValorantFixtureFacts, type Market } from '@polyrader/core';
import {
  LolMarketDiscoveryService,
  ValorantMarketDiscoveryService,
} from '../services/riot-games-market-discovery-service';

describe('LoL / Valorant public market discovery', () => {
  it('persists only a same-team LoL market under the canonical series', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildLolFixtureFacts(now);
    const upsert = vi.fn();
    const matching = market({
      conditionId: 'lol-real-1',
      question: 'League of Legends: T1 vs Hanwha Life Esports - Match Winner',
      outcomes: ['T1', 'Hanwha Life Esports'],
      endDate: facts.startsAt,
      tags: ['lol'],
    });
    const unrelated = market({
      conditionId: 'lol-other',
      question: 'League of Legends: Gen.G vs KT Rolster - Match Winner',
      outcomes: ['Gen.G', 'KT Rolster'],
      endDate: facts.startsAt,
      tags: ['lol'],
    });
    const service = new LolMarketDiscoveryService({
      gamma: { getMarketsForGame: vi.fn().mockResolvedValue([matching, unrelated]) },
      markets: { upsert, findByTag: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForFacts(facts);

    expect(result).toMatchObject({ scanned: 2, aligned: 1, marketIds: ['lol-real-1'] });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalMatchId: 'lol:lck-104' }),
    );
  });

  it('persists only a same-team Valorant market under the canonical series', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildValorantFixtureFacts(now);
    const upsert = vi.fn();
    const matching = market({
      conditionId: 'val-real-1',
      question: 'Valorant: Sentinels vs G2 Esports - Match Winner',
      outcomes: ['Sentinels', 'G2 Esports'],
      endDate: facts.startsAt,
      tags: ['valorant'],
    });
    const service = new ValorantMarketDiscoveryService({
      gamma: { getMarketsForGame: vi.fn().mockResolvedValue([matching]) },
      markets: { upsert, findByTag: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForFacts(facts);

    expect(result).toMatchObject({ scanned: 1, aligned: 1, marketIds: ['val-real-1'] });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalMatchId: 'valorant:vct-82' }),
    );
  });

  it('records gamma fetch failures in discovery detail instead of pretending empty inventory', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildLolFixtureFacts(now);
    const service = new LolMarketDiscoveryService({
      gamma: {
        getMarketsForGame: vi.fn().mockRejectedValue(new Error('Gamma lol fetch failed: browser blocked')),
      },
      markets: { upsert: vi.fn(), findByTag: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForFacts(facts);
    expect(result.scanned).toBe(0);
    expect(result.aligned).toBe(0);
    expect(result.detail).toContain('gamma failed');
    expect(result.detail).toContain('browser blocked');
  });

  it('picks a Polymarket-aligned LoL candidate when the first board sample has no market', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const preferred = buildLolFixtureFacts(now);
    const alternate = buildLolFixtureFacts(now);
    alternate.externalMatchId = 'rol-myth';
    alternate.id = 'lol:rol-myth';
    alternate.participants = [
      { participantId: 'Myth Esports', side: 'a', name: 'Myth Esports', source: 'liquipedia' },
      { participantId: 'Dynasty', side: 'b', name: 'Dynasty', source: 'liquipedia' },
    ];
    const upsert = vi.fn();
    const service = new LolMarketDiscoveryService({
      gamma: {
        getMarketsForGame: vi.fn().mockResolvedValue([
          market({
            conditionId: 'lol-myth',
            question: 'LoL: Myth Esports vs Dynasty (BO3) - Road Of Legends',
            outcomes: ['Myth Esports', 'Dynasty'],
            endDate: preferred.startsAt,
            tags: ['lol'],
          }),
        ]),
      },
      markets: { upsert, findByTag: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForCandidates([preferred, alternate]);
    expect(result).toMatchObject({
      scanned: 1,
      aligned: 1,
      marketIds: ['lol-myth'],
      matchedExternalMatchId: 'rol-myth',
    });
    expect(result.detail).toContain('sample rol-myth');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalMatchId: 'lol:rol-myth' }),
    );
  });

  it('ignores LoL prop markets and orphan totals that only inherit team names in description', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const facts = buildLolFixtureFacts(now);
    facts.participants = [
      { participantId: 'Myth Esports', side: 'a', name: 'Myth Esports', source: 'liquipedia' },
      { participantId: 'Dynasty', side: 'b', name: 'Dynasty', source: 'liquipedia' },
    ];
    const upsert = vi.fn();
    const service = new LolMarketDiscoveryService({
      gamma: {
        getMarketsForGame: vi.fn().mockResolvedValue([
          market({
            conditionId: 'lol-prop',
            question: 'Game 1: Both Teams Slay Baron Nashor?',
            description: 'Myth Esports vs Dynasty',
            outcomes: ['Yes', 'No'],
            endDate: facts.startsAt,
            tags: ['lol'],
          }),
          market({
            conditionId: 'lol-ou',
            question: 'Games Total: O/U 2.5',
            description: 'Myth Esports vs Dynasty',
            outcomes: ['Over', 'Under'],
            endDate: facts.startsAt,
            tags: ['lol'],
          }),
          market({
            conditionId: 'lol-series',
            question: 'LoL: Myth Esports vs Dynasty (BO3) - Road Of Legends',
            outcomes: ['Myth Esports', 'Dynasty'],
            endDate: facts.startsAt,
            tags: ['lol'],
          }),
        ]),
      },
      markets: { upsert, findByTag: vi.fn().mockReturnValue([]) },
    });

    const result = await service.discoverForFacts(facts);
    expect(result).toMatchObject({ scanned: 3, aligned: 1, marketIds: ['lol-series'] });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

function market(overrides: Partial<Market>): Market {
  return {
    conditionId: 'riot-market',
    slug: 'riot-market',
    question: 'Riot market',
    description: '',
    outcomes: ['A', 'B'],
    outcomePrices: ['0.5', '0.5'],
    volume: 1_000,
    volume24h: 100,
    liquidity: 2_000,
    startDate: '2026-07-23T00:00:00.000Z',
    endDate: '2026-07-23T14:00:00.000Z',
    status: 'active',
    tags: [],
    ...overrides,
  };
}
