import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchJsonWithBrowser } from '../../../crawlers/browser-fetch.js';
import { PolymarketGammaClient } from '../gamma-client';

vi.mock('../../../crawlers/browser-fetch.js', () => ({
  fetchJsonWithBrowser: vi.fn(),
}));

const mockFetchJsonWithBrowser = vi.mocked(fetchJsonWithBrowser);

// Factory: create a raw Gamma API market object
function rawMarket(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '0xcondition1',
    slug: 'some-market',
    question: 'Some random question',
    description: 'desc',
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.5","0.5"]',
    clobTokenIds: ['token1', 'token2'],
    volume: '10000',
    volume24hr: '5000',
    liquidity: '8000',
    endDate: '2026-12-20T00:00:00Z',
    startDate: '2026-12-19T00:00:00Z',
    closed: false,
    tags: [],
    ...overrides,
  };
}

describe('PolymarketGammaClient', () => {
  let client: PolymarketGammaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PolymarketGammaClient('https://gamma-api.test');
  });

  describe('getMarkets — CS2 filtering', () => {
    it('filters out non-CS2 markets and returns only CS2 markets', async () => {
      const apiData = [
        rawMarket({ id: '0xcs2_1', question: 'Counter-Strike: Spirit vs G2 (BO3)' }),
        rawMarket({ id: '0xcs2_2', question: 'Counter-Strike: Vitality vs Falcons' }),
        rawMarket({ id: '0xnba1', question: 'Lakers vs Celtics NBA Finals' }),
        rawMarket({ id: '0xelec1', question: 'Will Biden win the 2026 election?' }),
        rawMarket({ id: '0xcs2_3', question: 'CS2 Major Grand Final prediction' }),
        rawMarket({ id: '0xcsgo1', question: 'CSGO match tonight' }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const markets = await client.getMarkets(10);

      expect(markets).toHaveLength(4);
      const questions = markets.map((m) => m.question);
      expect(questions).toContain('Counter-Strike: Spirit vs G2 (BO3)');
      expect(questions).toContain('Counter-Strike: Vitality vs Falcons');
      expect(questions).toContain('CS2 Major Grand Final prediction');
      expect(questions).toContain('CSGO match tonight');
      // Non-CS2 markets must be excluded
      expect(questions).not.toContain('Lakers vs Celtics NBA Finals');
      expect(questions).not.toContain('Will Biden win the 2026 election?');
    });

    it('maps clobTokenIds from API response', async () => {
      const apiData = [
        rawMarket({
          id: '0xcs2_1',
          question: 'Counter-Strike: Spirit vs G2',
          clobTokenIds: ['12345', '67890'],
        }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const markets = await client.getMarkets(10);

      expect(markets).toHaveLength(1);
      expect(markets[0].clobTokenIds).toEqual(['12345', '67890']);
    });

    it('returns empty array when no CS2 markets exist in API response', async () => {
      const apiData = [
        rawMarket({ id: '0xnba1', question: 'Lakers vs Celtics' }),
        rawMarket({ id: '0xelec1', question: 'Election 2026' }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const markets = await client.getMarkets(10);

      expect(markets).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      const apiData = Array.from({ length: 20 }, (_, i) =>
        rawMarket({ id: `0xcs2_${i}`, question: `Counter-Strike: Match ${i}` }),
      );
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const markets = await client.getMarkets(5);

      expect(markets).toHaveLength(5);
    });

    it('sends correct query parameters (no tag=cs2)', async () => {
      mockFetchJsonWithBrowser.mockResolvedValue([]);

      await client.getMarkets(50, 0);

      const calledUrl = mockFetchJsonWithBrowser.mock.calls[0][0] as string;
      expect(calledUrl).toContain('active=true');
      expect(calledUrl).toContain('closed=false');
      expect(calledUrl).toContain('order=volume24hr');
      expect(calledUrl).toContain('ascending=false');
      // tag=cs2 must NOT be present — it's silently ignored by the API
      expect(calledUrl).not.toContain('tag=cs2');
      expect(calledUrl).not.toContain('tag_id');
    });
  });

  describe('getMarkets — field mapping', () => {
    it('correctly maps all Market fields from raw API data', async () => {
      const apiData = [
        rawMarket({
          id: '0xabc',
          slug: 'spirit-vs-g2',
          question: 'Counter-Strike: Spirit vs G2',
          description: 'IEM Cologne Major',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.65","0.35"]',
          clobTokenIds: ['tok_a', 'tok_b'],
          volume: '50000',
          volume24hr: '12000',
          liquidity: '8000',
          endDate: '2026-12-20T00:00:00Z',
          startDate: '2026-12-19T00:00:00Z',
          closed: false,
          tags: [],
        }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const [market] = await client.getMarkets(10);

      expect(market.conditionId).toBe('0xabc');
      expect(market.slug).toBe('spirit-vs-g2');
      expect(market.question).toBe('Counter-Strike: Spirit vs G2');
      expect(market.outcomes).toEqual(['Yes', 'No']);
      expect(market.outcomePrices).toEqual(['0.65', '0.35']);
      expect(market.clobTokenIds).toEqual(['tok_a', 'tok_b']);
      expect(market.volume).toBe(50000);
      expect(market.volume24h).toBe(12000);
      expect(market.liquidity).toBe(8000);
      expect(market.status).toBe('active');
      expect(market.tags).toEqual([]);
    });

    it('handles missing clobTokenIds gracefully', async () => {
      const apiData = [
        rawMarket({
          id: '0xcs2_1',
          question: 'Counter-Strike: Test',
          clobTokenIds: undefined,
        }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const [market] = await client.getMarkets(10);

      expect(market.clobTokenIds).toBeUndefined();
    });

    it('maps closed markets as closed status on direct lookup', async () => {
      mockFetchJsonWithBrowser.mockResolvedValue(
        rawMarket({
          id: '0xcs2_1',
          question: 'Counter-Strike: Closed Match',
          closed: true,
        }),
      );

      const market = await client.getMarket('0xcs2_1');

      expect(market?.status).toBe('closed');
    });
  });

  describe('searchMarkets — CS2 filtering', () => {
    it('only returns CS2 markets matching the query', async () => {
      const apiData = [
        rawMarket({ id: '0x1', question: 'Counter-Strike: Spirit vs G2' }),
        rawMarket({ id: '0x2', question: 'Counter-Strike: Vitality vs Falcons' }),
        rawMarket({ id: '0x3', question: 'Lakers vs Celtics' }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const results = await client.searchMarkets('spirit');

      expect(results).toHaveLength(1);
      expect(results[0].question).toBe('Counter-Strike: Spirit vs G2');
    });

    it('excludes non-CS2 markets even if they match the query', async () => {
      const apiData = [
        rawMarket({ id: '0x1', question: 'Counter-Strike: Spirit vs G2' }),
        rawMarket({ id: '0x2', question: 'Spirit Airlines bankruptcy?' }),
      ];
      mockFetchJsonWithBrowser.mockResolvedValue(apiData);

      const results = await client.searchMarkets('spirit');

      expect(results).toHaveLength(1);
      expect(results[0].question).toBe('Counter-Strike: Spirit vs G2');
    });
  });

});
