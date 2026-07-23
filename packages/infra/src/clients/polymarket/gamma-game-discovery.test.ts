import { describe, expect, it } from 'vitest';
import { PolymarketGammaClient } from './gamma-client';

describe('Polymarket public game discovery', () => {
  it('finds Dota markets without returning unrelated sports', async () => {
    const client = new PolymarketGammaClient('https://gamma.test');
    client.fetch = async () => [
      rawMarket({ id: 'dota-1', question: 'Dota 2: Liquid vs Falcons' }),
      rawMarket({ id: 'nba-1', question: 'Lakers vs Celtics' }),
    ] as never;

    const results = await client.getMarketsForGame('dota2', 10);

    expect(results.map((market) => market.conditionId)).toEqual(['dota-1']);
  });

  it('falls back to public-search for LoL when volume pages are empty', async () => {
    const client = new PolymarketGammaClient('https://gamma.test');
    client.fetch = (async (path: string) => {
      if (String(path).includes('public-search')) {
        return {
          markets: [rawMarket({ id: 'lol-search-1', question: 'League of Legends: T1 vs Gen.G' })],
        };
      }
      return [];
    }) as never;

    const results = await client.getMarketsForGame('lol', 10);
    expect(results.map((market) => market.conditionId)).toEqual(['lol-search-1']);
  });

  it('throws a typed fetch failure when volume and search both error', async () => {
    const client = new PolymarketGammaClient('https://gamma.test');
    client.fetch = (async () => {
      throw new Error('browser blocked');
    }) as never;

    await expect(client.getMarketsForGame('valorant', 5)).rejects.toThrow(/Gamma valorant fetch failed/);
  });
});

function rawMarket(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'market',
    slug: 'market',
    question: 'Dota 2 market',
    description: '',
    outcomes: '["A","B"]',
    outcomePrices: '["0.5","0.5"]',
    volume: '1000',
    volume24hr: '100',
    liquidity: '2000',
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    startDate: new Date().toISOString(),
    active: true,
    closed: false,
    tags: [],
    ...overrides,
  };
}
