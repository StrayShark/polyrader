import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@polyrader/infra', () => ({
  PolymarketGammaClient: vi.fn().mockImplementation(() => ({
    getMarkets: vi.fn(),
    getMarketsForGame: vi.fn(),
    getMarket: vi.fn(),
    getPriceHistory: vi.fn(),
  })),
  PolymarketClobClient: vi.fn().mockImplementation(() => ({
    getOrderBook: vi.fn(),
  })),
  PolymarketDataClient: vi.fn().mockImplementation(() => ({
    getHolders: vi.fn(),
    getMarketPositions: vi.fn(),
  })),
  MarketRepository: vi.fn().mockImplementation(() => ({
    findAll: vi.fn(),
    findByConditionId: vi.fn(),
    findBySlug: vi.fn(),
    getPriceHistory: vi.fn(),
    upsert: vi.fn(),
  })),
  AlertRepository: vi.fn().mockImplementation(() => ({
    getAlerts: vi.fn().mockReturnValue([]),
    getAlertById: vi.fn().mockReturnValue(null),
    createAlert: vi.fn(),
    updateAlert: vi.fn(),
    deleteAlert: vi.fn(),
    getTriggeredAlerts: vi.fn().mockReturnValue([]),
  })),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock('../websocket', () => ({
  broadcast: vi.fn(),
}));

import { MarketService } from '../services/market-service';
import { cacheGet, cacheSet } from '@polyrader/infra';

describe('MarketService', () => {
  const envBackup = { ...process.env };
  let service: MarketService;
  let gammaClient: {
    getMarkets: ReturnType<typeof vi.fn>;
    getMarketsForGame: ReturnType<typeof vi.fn>;
    getMarket: ReturnType<typeof vi.fn>;
    getPriceHistory: ReturnType<typeof vi.fn>;
  };
  let marketRepo: { findAll: ReturnType<typeof vi.fn>; findByConditionId: ReturnType<typeof vi.fn>; findBySlug: ReturnType<typeof vi.fn>; getPriceHistory: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envBackup };
    service = new MarketService();

    gammaClient = (service as unknown as { gammaClient: typeof gammaClient }).gammaClient;
    marketRepo = (service as unknown as { marketRepo: typeof marketRepo }).marketRepo;
  });

  describe('getMarkets', () => {
    it('returns cached markets when available', async () => {
      const mockMarkets = [{ conditionId: 'c1', question: 'Test?' }];
      vi.mocked(cacheGet).mockResolvedValue(mockMarkets as never);

      const result = await service.getMarkets(50, 0);

      expect(result).toBe(mockMarkets);
      expect(gammaClient.getMarkets).not.toHaveBeenCalled();
      expect(gammaClient.getMarketsForGame).not.toHaveBeenCalled();
    });

    it('fetches all supported esports games from API and caches when no cache', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const mockMarketsByGame = {
        cs2: [{ conditionId: 'cs2-1', question: 'Counter-Strike: Team A vs Team B' }],
        lol: [{ conditionId: 'lol-1', question: 'League of Legends: Team C vs Team D' }],
        dota2: [{ conditionId: 'dota2-1', question: 'Dota 2: Team E vs Team F' }],
        valorant: [{ conditionId: 'valorant-1', question: 'Valorant: Team G vs Team H' }],
      };
      gammaClient.getMarketsForGame.mockImplementation((game: keyof typeof mockMarketsByGame) =>
        Promise.resolve(mockMarketsByGame[game]),
      );
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.getMarkets(50, 0);

      expect(result).toHaveLength(4);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('cs2', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('lol', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('dota2', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('valorant', 200, 0);
      expect(cacheSet).toHaveBeenCalledWith('markets:50:0', expect.arrayContaining([
        expect.objectContaining({ conditionId: 'cs2-1' }),
        expect.objectContaining({ conditionId: 'lol-1' }),
        expect.objectContaining({ conditionId: 'dota2-1' }),
        expect.objectContaining({ conditionId: 'valorant-1' }),
      ]), 60);
      expect(marketRepo.upsert).toHaveBeenCalledTimes(4);
    });

    it('keeps every supported game represented in the first lobby page', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      marketRepo.findAll.mockReturnValue([]);
      marketRepo.upsert.mockReturnValue(undefined);

      const makeMarket = (conditionId: string, question: string, startDate: string) => ({
        conditionId,
        slug: conditionId,
        question,
        description: question,
        outcomes: ['A', 'B'],
        outcomePrices: ['0.5', '0.5'],
        volume: 10_000,
        volume24h: 2_000,
        liquidity: 10_000,
        endDate: startDate,
        startDate,
        status: 'active' as const,
        tags: [],
      });
      const cs2Markets = Array.from({ length: 12 }, (_, index) =>
        makeMarket(
          `cs2-${index}`,
          `Counter-Strike: CS2 Team ${index}A vs CS2 Team ${index}B (BO3) - Early Cup`,
          `2026-08-01T0${index % 9}:00:00Z`,
        ),
      );
      const lateMarkets = {
        lol: [makeMarket('lol-1', 'LoL: Alpha vs Beta (BO3) - Late Cup', '2026-08-02T10:00:00Z')],
        dota2: [makeMarket('dota2-1', 'Dota 2: Gamma vs Delta (BO3) - Late Cup', '2026-08-02T11:00:00Z')],
        valorant: [makeMarket('valorant-1', 'Valorant: Epsilon vs Zeta (BO3) - Late Cup', '2026-08-02T12:00:00Z')],
      };
      gammaClient.getMarketsForGame.mockImplementation((game: string) =>
        Promise.resolve(game === 'cs2' ? cs2Markets : lateMarkets[game as keyof typeof lateMarkets] ?? []),
      );

      const result = await service.getMarkets(4, 0);

      expect(result.map((market) => market.tags.find((tag) => ['cs2', 'lol', 'dota2', 'valorant'].includes(tag)))).toEqual([
        'cs2',
        'lol',
        'dota2',
        'valorant',
      ]);
    });

    it('promotes match winner markets before derivative handicap markets', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      marketRepo.findAll.mockReturnValue([]);
      marketRepo.upsert.mockReturnValue(undefined);

      const makeMarket = (conditionId: string, question: string, startDate: string) => ({
        conditionId,
        slug: conditionId,
        question,
        description: question,
        outcomes: ['A', 'B'],
        outcomePrices: ['0.5', '0.5'],
        volume: 10_000,
        volume24h: 2_000,
        liquidity: 10_000,
        endDate: startDate,
        startDate,
        status: 'active' as const,
        tags: [],
      });
      const mockMarketsByGame = {
        cs2: [makeMarket('cs2-1', 'Counter-Strike: Team A vs Team B (BO3) - Event', '2026-08-01T10:00:00Z')],
        lol: [
          makeMarket('lol-handicap', 'Game Handicap: JDG (-1.5) vs Team WE (+1.5)', '2026-08-01T11:00:00Z'),
          makeMarket('lol-winner', 'LoL: JD Gaming vs Team WE (BO3) - LPL Group Ascend', '2026-08-01T12:00:00Z'),
        ],
        dota2: [makeMarket('dota2-1', 'Dota 2: Team A vs Team B (BO3) - Event', '2026-08-01T13:00:00Z')],
        valorant: [makeMarket('valorant-1', 'Valorant: Team A vs Team B (BO3) - Event', '2026-08-01T14:00:00Z')],
      };
      gammaClient.getMarketsForGame.mockImplementation((game: keyof typeof mockMarketsByGame) =>
        Promise.resolve(mockMarketsByGame[game]),
      );

      const result = await service.getMarkets(4, 0);

      expect(result.map((market) => market.conditionId)).toContain('lol-winner');
      expect(result.map((market) => market.conditionId)).not.toContain('lol-handicap');
    });

    it('prioritizes recent single-match markets before long-running futures markets', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      marketRepo.findAll.mockReturnValue([]);
      marketRepo.upsert.mockReturnValue(undefined);

      const makeMarket = (conditionId: string, question: string, endDate: string, volume24h = 1_000) => ({
        conditionId,
        slug: conditionId,
        question,
        description: question,
        outcomes: ['A', 'B'],
        outcomePrices: ['0.5', '0.5'],
        volume: 10_000,
        volume24h,
        liquidity: 10_000,
        endDate,
        startDate: endDate,
        status: 'active' as const,
        tags: [],
      });
      const futures = Array.from({ length: 8 }, (_, index) =>
        makeMarket(
          `lol-future-${index}`,
          `Will Team ${index} win the LCK 2026 season playoffs?`,
          '2026-12-31T00:00:00Z',
          20_000 - index,
        ),
      );
      const recent = makeMarket(
        'lol-recent',
        'LoL: Team WE vs JD Gaming (BO3) - LPL Group Ascend',
        '2026-07-25T12:00:00Z',
        500,
      );
      gammaClient.getMarketsForGame.mockImplementation((game: string) =>
        Promise.resolve(game === 'lol' ? [...futures, recent] : []),
      );

      const result = await service.getMarkets(20, 0);

      const lolRecentIndex = result.findIndex((market) => market.conditionId === 'lol-recent');
      const firstLolFutureIndex = result.findIndex((market) => market.conditionId.startsWith('lol-future-'));
      expect(lolRecentIndex).toBeGreaterThanOrEqual(0);
      expect(firstLolFutureIndex).toBeGreaterThan(lolRecentIndex);
    });

    it('falls back to DB when API fails', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarketsForGame.mockRejectedValue(new Error('API down'));

      const dbMarkets = [{ conditionId: 'c1', question: 'DB Market' }];
      marketRepo.findAll.mockReturnValue(dbMarkets);
      marketRepo.findByConditionId.mockReturnValue(null);

      const result = await service.getMarkets(50, 0);

      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(dbMarkets[0])]));
      expect(result.map((market) => market.conditionId)).toEqual(
        expect.arrayContaining([
          'local-seed-navi-faze-bo3',
          'local-seed-t1-geng-bo3',
          'local-seed-liquid-falcons-bo3',
          'local-seed-sentinels-g2-bo3',
        ]),
      );
      expect(marketRepo.findAll).toHaveBeenCalledWith(200, 0);
    });

    it('falls back to local DB when API succeeds with no open markets', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarketsForGame.mockResolvedValue([]);

      const dbMarkets = [{ conditionId: 'local-hltv-1', question: 'Local CS2 practice market' }];
      marketRepo.findAll.mockReturnValue(dbMarkets);
      marketRepo.findByConditionId.mockReturnValue(null);

      const result = await service.getMarkets(50, 0);

      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(dbMarkets[0])]));
      expect(result.map((market) => market.conditionId)).toEqual(
        expect.arrayContaining([
          'local-seed-navi-faze-bo3',
          'local-seed-t1-geng-bo3',
          'local-seed-liquid-falcons-bo3',
          'local-seed-sentinels-g2-bo3',
        ]),
      );
      expect(marketRepo.findAll).toHaveBeenCalledWith(200, 0);
      expect(cacheSet).not.toHaveBeenCalledWith('markets:50:0', dbMarkets, 60);
    });

    it('falls back quickly to DB when API is slower than the timeout', async () => {
      process.env.POLYRADER_MARKET_TIMEOUT_MS = '5';
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarketsForGame.mockImplementation(() => new Promise(() => undefined));

      const dbMarkets = [{ conditionId: 'c1', question: 'DB Market' }];
      marketRepo.findAll.mockReturnValue(dbMarkets);
      marketRepo.findByConditionId.mockReturnValue(null);

      const result = await service.getMarkets(50, 0);

      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(dbMarkets[0])]));
      expect(result.map((market) => market.conditionId)).toEqual(
        expect.arrayContaining([
          'local-seed-navi-faze-bo3',
          'local-seed-t1-geng-bo3',
          'local-seed-liquid-falcons-bo3',
          'local-seed-sentinels-g2-bo3',
        ]),
      );
      expect(marketRepo.findAll).toHaveBeenCalledWith(200, 0);
    });

    it('returns local seed markets when API and DB are unavailable', async () => {
      process.env.POLYRADER_MARKET_TIMEOUT_MS = '5';
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarketsForGame.mockImplementation(() => new Promise(() => undefined));
      marketRepo.findAll.mockReturnValue([]);

      const result = await service.getMarkets(50, 0);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].tags).toContain('local-seed');
      expect(marketRepo.upsert).toHaveBeenCalled();
    });
  });

  describe('getMarket', () => {
    it('returns cached market when available', async () => {
      const mockMarket = { conditionId: 'c1', question: 'Test?' };
      vi.mocked(cacheGet).mockResolvedValue(mockMarket as never);

      const result = await service.getMarket('c1');

      expect(result).toBe(mockMarket);
    });

    it('fetches single market from API and caches', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const mockMarket = { conditionId: 'c1', question: 'Test?' };
      gammaClient.getMarket.mockResolvedValue(mockMarket);
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.getMarket('c1');

      expect(result).toBe(mockMarket);
      expect(cacheSet).toHaveBeenCalledWith('market:c1', mockMarket, 60);
      expect(marketRepo.upsert).toHaveBeenCalledWith(mockMarket);
    });

    it('returns null when API returns null', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarket.mockResolvedValue(null);

      const result = await service.getMarket('nonexistent');

      expect(result).toBeNull();
    });

    it('falls back to DB when API fails', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      gammaClient.getMarket.mockRejectedValue(new Error('API down'));

      const dbMarket = { conditionId: 'c1', question: 'DB Market' };
      marketRepo.findByConditionId.mockResolvedValue(dbMarket);

      const result = await service.getMarket('c1');

      expect(result).toBe(dbMarket);
      expect(marketRepo.findByConditionId).toHaveBeenCalledWith('c1');
    });
  });

  describe('getPriceHistory', () => {
    it('returns price history from API', async () => {
      const mockHistory = [
        { timestamp: '2024-01-01', price: 0.5 },
        { timestamp: '2024-01-02', price: 0.6 },
      ];
      gammaClient.getPriceHistory.mockResolvedValue(mockHistory);

      const result = await service.getPriceHistory('c1');

      expect(result).toHaveLength(2);
      expect(gammaClient.getPriceHistory).toHaveBeenCalledWith('c1');
    });

    it('returns empty array when API fails', async () => {
      gammaClient.getPriceHistory.mockImplementation(async () => {
        throw new Error('API down');
      });

      const result = await service.getPriceHistory('c2');

      expect(result).toEqual([]);
    });
  });

  describe('refreshMarkets', () => {
    it('fetches and caches markets', async () => {
      const mockMarkets = [
        { conditionId: 'c1', question: 'Counter-Strike: M1 vs M2' },
        { conditionId: 'c2', question: 'League of Legends: M3 vs M4' },
      ];
      gammaClient.getMarketsForGame.mockImplementation((game: string) =>
        Promise.resolve(game === 'cs2' ? [mockMarkets[0]] : game === 'lol' ? [mockMarkets[1]] : []),
      );
      marketRepo.upsert.mockReturnValue(undefined);

      const result = await service.refreshMarkets();

      expect(result.map((market) => market.conditionId)).toEqual(
        expect.arrayContaining([
          'c1',
          'c2',
          'local-seed-liquid-falcons-bo3',
          'local-seed-sentinels-g2-bo3',
        ]),
      );
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('cs2', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('lol', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('dota2', 200, 0);
      expect(gammaClient.getMarketsForGame).toHaveBeenCalledWith('valorant', 200, 0);
      expect(marketRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ conditionId: 'c1', tags: expect.arrayContaining(['cs2']) }),
      );
      expect(marketRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ conditionId: 'c2', tags: expect.arrayContaining(['lol']) }),
      );
      expect(cacheSet).toHaveBeenCalledWith('markets:50:0', expect.arrayContaining([
        expect.objectContaining({ conditionId: 'c1' }),
        expect.objectContaining({ conditionId: 'c2' }),
      ]), 60);
    });

    it('returns local seed markets when API refresh fails and DB is empty', async () => {
      gammaClient.getMarketsForGame.mockRejectedValue(new Error('API down'));
      marketRepo.findAll.mockReturnValue([]);

      const result = await service.refreshMarkets();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].tags).toContain('local-seed');
    });

    it('preserves local DB markets when API refresh succeeds with an empty list', async () => {
      gammaClient.getMarketsForGame.mockResolvedValue([]);
      const dbMarkets = [{ conditionId: 'local-db-1', question: 'Local practice market' }];
      marketRepo.findAll.mockReturnValue(dbMarkets);
      marketRepo.findByConditionId.mockReturnValue(null);

      const result = await service.refreshMarkets();

      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(dbMarkets[0])]));
      expect(result.map((market) => market.conditionId)).toEqual(
        expect.arrayContaining([
          'local-seed-navi-faze-bo3',
          'local-seed-t1-geng-bo3',
          'local-seed-liquid-falcons-bo3',
          'local-seed-sentinels-g2-bo3',
        ]),
      );
      expect(marketRepo.findAll).toHaveBeenCalledWith(200, 0);
      expect(cacheSet).not.toHaveBeenCalledWith('markets:50:0', expect.arrayContaining([expect.objectContaining(dbMarkets[0])]), 60);
    });
  });

  describe('getOrderBook', () => {
    it('returns cached orderbook when available', async () => {
      const mockBook = { bids: [], asks: [], spread: 0.01, midpoint: 0.5 };
      vi.mocked(cacheGet).mockResolvedValue(mockBook as never);

      const result = await service.getOrderBook('c1');

      expect(result).toBe(mockBook);
    });

    it('returns null when market has no clobTokenIds', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      // Mock getMarket to return a market without clobTokenIds
      gammaClient.getMarket.mockResolvedValue({ conditionId: 'c1', clobTokenIds: [] });

      const result = await service.getOrderBook('c1');

      expect(result).toBeNull();
    });
  });
});
