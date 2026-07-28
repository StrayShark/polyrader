import type {
  EsportsGame,
  Market,
  PolymarketHolder,
  PolymarketMarketPosition,
} from '@polyrader/core';
import {
  PolymarketGammaClient,
  PolymarketClobClient,
  PolymarketDataClient,
} from '@polyrader/infra';
import type { OrderBookSummary } from '@polyrader/infra';
import { MarketRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { RequestDedup } from './request-dedup';
import { AlertService } from './alert-service';
import { getLocalSeedMarkets } from './local-seed-data';
import { isLobbyVisibleMarket, isOpenMarket } from './market-eligibility';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';
import { envNumber, withTimeout } from '../utils/timeout';
import { mergeCanonicalMarkets, withCanonicalMarketId } from './canonical-market-merge';
import { buildLocalMapWinnerMarkets } from './local-simulation-market';
import { parsePolymarketMatch } from '@polyrader/core';

const CACHE_TTL = 60; // 1 minute
const ORDERBOOK_CACHE_TTL = 10; // 10 seconds for orderbook
const SUPPORTED_LOBBY_GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

export interface MarketAnomaly {
  conditionId: string;
  question: string;
  type: 'price_spike' | 'volume_surge';
  severity: 'low' | 'medium' | 'high';
  detail: string;
  value: number;
}

export class MarketService {
  private gammaClient = new PolymarketGammaClient();
  private clobClient = new PolymarketClobClient();
  private dataClient = new PolymarketDataClient();
  private marketRepo = new MarketRepository();
  private dedup = new RequestDedup<unknown>();
  private alertService = new AlertService();

  /**
   * Build a marketSlug → {price, volume} map from fetched markets,
   * run alert threshold checks, and broadcast any triggered alerts via WebSocket.
   */
  private checkPriceAlerts(markets: Market[]): void {
    try {
      const marketPrices = new Map<string, { price: number; volume: number }>();
      for (const market of markets) {
        const price = parseFloat(market.outcomePrices?.[0] ?? '0');
        if (!Number.isFinite(price)) continue;
        marketPrices.set(market.slug, {
          price,
          volume: market.volume24h ?? market.volume ?? 0,
        });
      }
      if (marketPrices.size === 0) return;
      const triggered = this.alertService.checkAlerts(marketPrices);
      if (triggered.length > 0) {
        broadcast('alerts', { type: 'alert:triggered', alerts: triggered });
        logger.info('Alerts triggered', { count: triggered.length });
      }
    } catch (err) {
      logger.warn('Alert check failed', { error: (err as Error).message });
    }
  }

  async getMarkets(limit = 50, offset = 0): Promise<Market[]> {
    if (externalMarketsDisabled()) return this.getDbOrSeedMarkets(limit, offset);
    const cacheKey = `markets:${limit}:${offset}`;
    const cached = await cacheGet<Market[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const markets = await withTimeout(
          this.fetchOpenMarketsForLobby(limit + offset),
          marketTimeoutMs(),
          `polymarket gamma esports markets ${limit}:${offset}`,
        );
        const openMarkets = markets;
        if (openMarkets.length === 0) {
          logger.info(
            'Polymarket returned no open markets, falling back to local practice markets',
            { cacheKey },
          );
          return this.getDbOrSeedMarkets(limit, offset, { cacheSeeds: false });
        }
        for (const market of openMarkets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', {
              conditionId: market.conditionId,
              error: (err as Error).message,
            });
          }
        }
        const localMarkets = (
          (await Promise.resolve(this.marketRepo.findAll(200, 0))) ?? []
        )
          .filter((market) => isLobbyVisibleMarket(market))
          .map(normalizeMarketGameTags);
        const withMaps = this.ensureLocalMapWinnerMarkets(localMarkets);
        const merged = prioritizeLobbyGameCoverage(ensureLobbyGameCoverageFallback(mergeCanonicalMarkets([
          ...withMaps,
          ...openMarkets.filter((market) => isLobbyVisibleMarket(market)),
        ]))).slice(offset, offset + limit);
        for (const market of merged) {
          if (market.canonicalMatchId && market.match) this.marketRepo.upsert(market);
        }
        await cacheSet(cacheKey, merged, CACHE_TTL);
        this.checkPriceAlerts(merged);
        return merged;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', {
          cacheKey,
          error: (err as Error).message,
        });
        return this.getDbOrSeedMarkets(limit, offset, { cacheSeeds: false });
      }
    }) as Promise<Market[]>;
  }

  async getMarket(conditionId: string): Promise<Market | null> {
    const cacheKey = `market:${conditionId}`;
    const cached = await cacheGet<Market>(cacheKey);
    if (cached) return cached;

    if (externalMarketsDisabled()) {
      return (
        this.marketRepo.findByConditionId(conditionId) ??
        this.marketRepo.findBySlug(conditionId) ??
        getLocalSeedMarkets(100, 0).find(
          (market) => market.conditionId === conditionId || market.slug === conditionId,
        ) ??
        null
      );
    }

    return this.dedup.run(cacheKey, async () => {
      const stored =
        this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
      if (stored?.tags?.includes('local-sim')) return withCanonicalMarketId(stored);
      try {
        const market = await withTimeout(
          this.gammaClient.getMarket(conditionId),
          marketTimeoutMs(),
          `polymarket gamma market ${conditionId}`,
        );
        if (market) {
          await cacheSet(cacheKey, market, CACHE_TTL);
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', {
              conditionId,
              error: (err as Error).message,
            });
          }
        }
        return market;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', {
          conditionId,
          error: (err as Error).message,
        });
        const dbMarket = await Promise.resolve(this.marketRepo.findByConditionId(conditionId));
        return (
          dbMarket ??
          getLocalSeedMarkets(100, 0).find((market) => market.conditionId === conditionId) ??
          null
        );
      }
    }) as Promise<Market | null>;
  }

  async getPriceHistory(conditionId: string): Promise<Array<{ timestamp: string; price: number }>> {
    return this.dedup.run(`pricehistory:${conditionId}`, async () => {
      const stored =
        this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
      if (stored?.tags?.includes('local-sim')) {
        return this.marketRepo.getPriceHistory(stored.conditionId, 100).reverse();
      }
      if (externalMarketsDisabled()) {
        return stored ? this.marketRepo.getPriceHistory(stored.conditionId, 100).reverse() : [];
      }
      try {
        return await withTimeout(
          this.gammaClient.getPriceHistory(conditionId),
          marketTimeoutMs(),
          `polymarket gamma price history ${conditionId}`,
        );
      } catch (err) {
        logger.warn('Failed to fetch price history', {
          conditionId,
          error: (err as Error).message,
        });
        return [];
      }
    }) as Promise<Array<{ timestamp: string; price: number }>>;
  }

  async refreshMarkets(): Promise<Market[]> {
    if (externalMarketsDisabled()) return this.primeLocalMarketsCache(100);
    return this.dedup.run('refresh:markets', async () => {
      try {
        const markets = await withTimeout(
          this.fetchOpenMarketsForLobby(100),
          marketTimeoutMs(),
          'polymarket gamma esports refresh markets',
        );
        const openMarkets = markets;
        if (openMarkets.length === 0) {
          logger.info(
            'Polymarket refresh returned no open markets, preserving local practice markets',
          );
          return this.getDbOrSeedMarkets(100, 0, { cacheSeeds: false });
        }
        for (const market of openMarkets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', {
              conditionId: market.conditionId,
              error: (err as Error).message,
            });
          }
        }
        const localMarkets = (
          (await Promise.resolve(this.marketRepo.findAll(200, 0))) ?? []
        )
          .filter((market) => isLobbyVisibleMarket(market))
          .map(normalizeMarketGameTags);
        const merged = prioritizeLobbyGameCoverage(ensureLobbyGameCoverageFallback(mergeCanonicalMarkets([
          ...localMarkets,
          ...openMarkets.filter((market) => isLobbyVisibleMarket(market)),
        ])));
        for (const market of merged) {
          if (market.canonicalMatchId && market.match) this.marketRepo.upsert(market);
        }
        await cacheSet('markets:50:0', merged.slice(0, 50), CACHE_TTL);
        this.checkPriceAlerts(merged);
        return merged;
      } catch (err) {
        logger.error('Failed to refresh markets from Polymarket', {
          error: (err as Error).message,
        });
        return this.getDbOrSeedMarkets(100, 0, { cacheSeeds: false });
      }
    }) as Promise<Market[]>;
  }

  async primeLocalMarketsCache(limit = 100): Promise<Market[]> {
    const markets = await this.getDbOrSeedMarkets(limit, 0);
    await Promise.all([
      cacheSet('markets:50:0', markets.slice(0, 50), CACHE_TTL),
      cacheSet(`markets:${limit}:0`, markets, CACHE_TTL),
    ]);
    return markets;
  }

  async getOrderBook(conditionId: string, tokenId?: string): Promise<OrderBookSummary | null> {
    if (externalMarketsDisabled()) return null;
    const cacheKey = `orderbook:${conditionId}:${tokenId ?? 'default'}`;
    const cached = await cacheGet<OrderBookSummary>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const stored =
          this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
        if (stored?.tags?.includes('local-sim')) return null;
        let resolvedTokenId = tokenId;
        if (!resolvedTokenId) {
          const market = await this.getMarket(conditionId);
          if (!market?.clobTokenIds || market.clobTokenIds.length === 0) return null;
          resolvedTokenId = market.clobTokenIds[0];
        }

        const orderBook = await withTimeout(
          this.clobClient.getOrderBook(resolvedTokenId),
          marketTimeoutMs(),
          `polymarket clob orderbook ${conditionId}`,
        );
        await cacheSet(cacheKey, orderBook, ORDERBOOK_CACHE_TTL);
        return orderBook;
      } catch (err) {
        logger.warn('Failed to fetch order book', {
          conditionId,
          tokenId,
          error: (err as Error).message,
        });
        return null;
      }
    }) as Promise<OrderBookSummary | null>;
  }

  getLocalOdds(conditionId: string): {
    conditionId: string;
    source: 'local-sim';
    outcomes: string[];
    probabilities: number[];
    decimalOdds: number[];
    capturedAt?: string;
    history: Array<{ timestamp: string; price: number }>;
  } | null {
    const market =
      this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
    if (!market?.tags?.includes('local-sim')) return null;
    const probabilities = market.outcomePrices.map((price) => Number(price));
    const history = this.marketRepo.getPriceHistory(market.conditionId, 100).reverse();
    return {
      conditionId: market.conditionId,
      source: 'local-sim',
      outcomes: market.outcomes,
      probabilities,
      decimalOdds: probabilities.map((probability) => (probability > 0 ? 1 / probability : 0)),
      capturedAt: history.at(-1)?.timestamp,
      history,
    };
  }

  async getHolders(conditionId: string, limit = 50): Promise<PolymarketHolder[]> {
    if (externalMarketsDisabled()) return [];
    const cacheKey = `holders:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketHolder[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const holders = await this.dataClient.getHolders(conditionId, limit);
        await cacheSet(cacheKey, holders, 60);
        return holders;
      } catch (err) {
        logger.warn('Failed to fetch market holders', {
          conditionId,
          error: (err as Error).message,
        });
        return [];
      }
    }) as Promise<PolymarketHolder[]>;
  }

  async getMarketPositions(conditionId: string, limit = 100): Promise<PolymarketMarketPosition[]> {
    if (externalMarketsDisabled()) return [];
    const cacheKey = `market-positions:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketMarketPosition[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const positions = await this.dataClient.getMarketPositions(conditionId, limit);
        await cacheSet(cacheKey, positions, 60);
        return positions;
      } catch (err) {
        logger.warn('Failed to fetch market positions', {
          conditionId,
          error: (err as Error).message,
        });
        return [];
      }
    }) as Promise<PolymarketMarketPosition[]>;
  }

  /** Poll CLOB midpoints for top markets and broadcast via WebSocket. */
  async pollAndBroadcastPrices(limit = 20): Promise<number> {
    const markets = await this.getMarkets(limit, 0);
    let updated = 0;

    for (const market of markets) {
      const tokenId = market.clobTokenIds?.[0];
      if (!tokenId) continue;

      try {
        const price = await this.clobClient.getMidpoint(tokenId);
        if (!Number.isFinite(price) || price <= 0 || price >= 1) continue;

        this.marketRepo.insertPriceHistory(market.conditionId, price);
        const payload = {
          conditionId: market.conditionId,
          price,
          timestamp: Date.now(),
        };
        broadcast(`prices:${market.conditionId}`, payload);
        broadcast('prices', payload);
        updated++;
      } catch (err) {
        logger.warn('Price poll failed', {
          conditionId: market.conditionId,
          error: (err as Error).message,
        });
      }
    }

    return updated;
  }

  private async getDbOrSeedMarkets(
    limit: number,
    offset: number,
    options: { cacheSeeds?: boolean } = {},
  ): Promise<Market[]> {
    const dbMarkets = (await Promise.resolve(this.marketRepo.findAll(200, 0))) ?? [];
    const openDbMarkets = dbMarkets
      .filter((market) => isLobbyVisibleMarket(market))
      .map(normalizeMarketGameTags);
    if (openDbMarkets.length > 0) {
      const withMaps = this.ensureLocalMapWinnerMarkets(openDbMarkets);
      const merged = prioritizeLobbyGameCoverage(ensureLobbyGameCoverageFallback(mergeCanonicalMarkets(withMaps)));
      return merged.slice(offset, offset + limit);
    }

    const seeds = getLocalSeedMarkets(limit, offset);
    if (seeds.length === 0) return [];

    const persisted: Market[] = [];
    for (const market of seeds) {
      try {
        this.marketRepo.upsert(market);
        persisted.push(market);
        if (!market.tags.includes('map-winner')) {
          for (const mapMarket of buildLocalMapWinnerMarkets(market)) {
            this.marketRepo.upsert(mapMarket);
            persisted.push(mapMarket);
          }
        }
      } catch (err) {
        logger.warn('Failed to persist local seed market', {
          conditionId: market.conditionId,
          error: (err as Error).message,
        });
      }
    }
    if (options.cacheSeeds ?? true) {
      await cacheSet(`markets:${limit}:${offset}`, persisted, CACHE_TTL);
    }
    return persisted;
  }

  private async fetchOpenMarketsForLobby(limit: number): Promise<Market[]> {
    const perGameLimit = Math.max(limit, 200);
    const results = await Promise.allSettled(
      SUPPORTED_LOBBY_GAMES.map(async (game) => ({
        game,
        markets: (await this.gammaClient.getMarketsForGame(game, perGameLimit, 0)).map((market) =>
          tagMarketForGame(market, game),
        ),
      })),
    );

    const openMarkets: Market[] = [];
    const failures: Array<{ game: EsportsGame; error: string }> = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        openMarkets.push(...result.value.markets.filter((market) => isOpenMarket(market)));
        continue;
      }
      const game = SUPPORTED_LOBBY_GAMES[index] ?? 'cs2';
      failures.push({
        game,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }

    if (failures.length > 0) {
      logger.warn('Some Polymarket esports market fetches failed', { failures });
    }
    if (openMarkets.length === 0 && failures.length === SUPPORTED_LOBBY_GAMES.length) {
      throw new Error('All Polymarket esports market fetches failed');
    }

    return mergeCanonicalMarkets(openMarkets);
  }

  /** Persist missing Map Winner markets for local practice series so lobby can expand +N. */
  private ensureLocalMapWinnerMarkets(markets: Market[]): Market[] {
    const extras: Market[] = [];
    const seen = new Set(markets.map((market) => market.conditionId));
    for (const market of markets) {
      if (!isLocalPracticeSeriesMarket(market)) continue;
      for (const mapMarket of buildLocalMapWinnerMarkets(market)) {
        try {
          const existing = this.marketRepo.findByConditionId(mapMarket.conditionId);
          if (!existing) {
            this.marketRepo.upsert(mapMarket);
            if (!seen.has(mapMarket.conditionId)) {
              extras.push(mapMarket);
              seen.add(mapMarket.conditionId);
            }
            continue;
          }
          if (isLobbyVisibleMarket(existing) && !seen.has(existing.conditionId)) {
            extras.push(existing);
            seen.add(existing.conditionId);
          }
        } catch (err) {
          logger.warn('Failed to ensure map-winner market', {
            conditionId: mapMarket.conditionId,
            error: (err as Error).message,
          });
        }
      }
    }
    return extras.length > 0 ? [...markets, ...extras] : markets;
  }

  /** Detect unusual price moves and volume spikes across active markets. */
  async detectAnomalies(limit = 30): Promise<MarketAnomaly[]> {
    const markets = await this.getMarkets(limit, 0);
    const anomalies: MarketAnomaly[] = [];

    for (const market of markets) {
      const currentPrice = parseFloat(market.outcomePrices[0] ?? '0');
      if (!Number.isFinite(currentPrice)) continue;

      const history = this.marketRepo.getPriceHistory(market.conditionId, 20);
      if (history.length >= 2) {
        const prevPrice = history[1].price;
        const change = Math.abs(currentPrice - prevPrice);
        if (change >= 0.05) {
          anomalies.push({
            conditionId: market.conditionId,
            question: market.question,
            type: 'price_spike',
            severity: change >= 0.15 ? 'high' : change >= 0.08 ? 'medium' : 'low',
            detail: `Price moved ${(change * 100).toFixed(1)}% (${(prevPrice * 100).toFixed(1)}% → ${(currentPrice * 100).toFixed(1)}%)`,
            value: change,
          });
        }
      }

      const vol24h = market.volume24h ?? 0;
      const totalVol = market.volume ?? 0;
      if (vol24h > 10_000 && totalVol > vol24h) {
        const priorVol = totalVol - vol24h;
        const surgeRatio = priorVol > 0 ? vol24h / priorVol : vol24h;
        if (surgeRatio >= 0.5) {
          anomalies.push({
            conditionId: market.conditionId,
            question: market.question,
            type: 'volume_surge',
            severity: surgeRatio >= 1 ? 'high' : surgeRatio >= 0.75 ? 'medium' : 'low',
            detail: `24h volume $${(vol24h / 1000).toFixed(1)}K (${(surgeRatio * 100).toFixed(0)}% of prior)`,
            value: surgeRatio,
          });
        }
      }
    }

    const severityRank = { high: 3, medium: 2, low: 1 };
    return anomalies.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  }
}

function marketTimeoutMs(): number {
  return envNumber(
    'POLYRADER_MARKET_TIMEOUT_MS',
    envNumber('POLYRADER_EXTERNAL_TIMEOUT_MS', 25000, 250, 30000),
    250,
    30000,
  );
}

function externalMarketsDisabled(): boolean {
  return process.env.POLYRADER_SKIP_EXTERNAL_MARKETS === '1';
}

function tagMarketForGame(market: Market, game: EsportsGame): Market {
  return {
    ...market,
    tags: [...new Set([...(market.tags ?? []), game, 'polymarket'])],
  };
}

function normalizeMarketGameTags(market: Market): Market {
  const game = inferMarketGame(market);
  if (!game || market.tags?.includes(game)) return market;
  return tagMarketForGame(market, game);
}

function inferMarketGame(market: Market): EsportsGame | null {
  const tags = market.tags ?? [];
  for (const game of SUPPORTED_LOBBY_GAMES) {
    if (tags.includes(game)) return game;
  }
  const canonical = market.canonicalMatchId ?? market.match?.canonicalMatchId ?? '';
  if (canonical.startsWith('lol:')) return 'lol';
  if (canonical.startsWith('dota2:')) return 'dota2';
  if (canonical.startsWith('valorant:')) return 'valorant';
  if (canonical.startsWith('hltv:')) return 'cs2';

  const question = market.question.toLowerCase();
  if (question.startsWith('counter-strike') || question.startsWith('cs2:') || question.includes('csgo')) return 'cs2';
  if (question.startsWith('lol:') || question.startsWith('league of legends:')) return 'lol';
  if (question.startsWith('dota 2:') || question.startsWith('dota2:')) return 'dota2';
  if (question.startsWith('valorant:')) return 'valorant';
  return null;
}

function prioritizeLobbyGameCoverage(markets: Market[]): Market[] {
  if (markets.length <= SUPPORTED_LOBBY_GAMES.length) return markets;

  const promoted: Market[] = [];
  const promotedIds = new Set<string>();
  for (const game of SUPPORTED_LOBBY_GAMES) {
    const market = markets.find(
      (candidate) => hasGameTag(candidate, game) && isRecentSingleMatchMarket(candidate),
    );
    if (!market || promotedIds.has(market.conditionId)) continue;
    promoted.push(market);
    promotedIds.add(market.conditionId);
  }

  const rest = markets
    .filter((market) => !promotedIds.has(market.conditionId))
    .sort(compareLobbyMarkets);
  if (promoted.length === 0) return rest;
  return [...promoted, ...rest];
}

function ensureLobbyGameCoverageFallback(markets: Market[]): Market[] {
  const covered = new Set<EsportsGame>();
  for (const game of SUPPORTED_LOBBY_GAMES) {
    if (markets.some((market) => hasGameTag(market, game) && isRecentSingleMatchMarket(market))) {
      covered.add(game);
    }
  }
  if (covered.size === SUPPORTED_LOBBY_GAMES.length) return markets;

  const additions: Market[] = [];
  const seeds = getLocalSeedMarkets(200, 0).map(normalizeMarketGameTags);
  for (const game of SUPPORTED_LOBBY_GAMES) {
    if (covered.has(game)) continue;
    const seed = seeds.find(
      (market) =>
        hasGameTag(market, game) &&
        isLobbyVisibleMarket(market) &&
        isRecentSingleMatchMarket(market),
    );
    if (seed) additions.push(seed);
  }
  return additions.length > 0 ? mergeCanonicalMarkets([...markets, ...additions]) : markets;
}

function hasGameTag(market: Market, game: EsportsGame): boolean {
  return market.tags?.includes(game) ?? false;
}

function isPrimaryWinnerMarket(market: Market): boolean {
  const parsed = parsePolymarketMatch(market.question);
  if (!parsed || parsed.isMapMarket) return false;
  const question = market.question.toLowerCase();
  return !(
    question.includes('handicap') ||
    question.includes('spread') ||
    question.includes('correct score') ||
    question.includes('total maps') ||
    question.includes('total games') ||
    question.includes('total rounds') ||
    /\bo\/u\b/.test(question) ||
    /over\/under/.test(question) ||
    /\+\d+\.5/.test(question) ||
    /-\d+\.5/.test(question)
  );
}

function isRecentSingleMatchMarket(market: Market): boolean {
  const parsed = parsePolymarketMatch(market.question);
  return Boolean(
    parsed &&
      (isPrimaryWinnerMarket(market) || isMapOrGameWinnerMarket(market)) &&
      !isDerivativeMarketQuestion(market.question),
  );
}

function compareLobbyMarkets(a: Market, b: Market): number {
  const singleMatchDelta = Number(isRecentSingleMatchMarket(b)) - Number(isRecentSingleMatchMarket(a));
  if (singleMatchDelta !== 0) return singleMatchDelta;

  const primaryDelta = Number(isPrimaryWinnerMarket(b)) - Number(isPrimaryWinnerMarket(a));
  if (primaryDelta !== 0) return primaryDelta;

  const timeDelta = marketTimeMs(a) - marketTimeMs(b);
  if (timeDelta !== 0) return timeDelta;

  return (b.volume24h ?? b.volume ?? 0) - (a.volume24h ?? a.volume ?? 0);
}

function marketTimeMs(market: Market): number {
  const value = market.match?.scheduledAt ?? market.endDate ?? market.startDate;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function isDerivativeMarketQuestion(question: string): boolean {
  const normalized = question.toLowerCase();
  return (
    normalized.includes('handicap') ||
    normalized.includes('spread') ||
    normalized.includes('correct score') ||
    normalized.includes('total maps') ||
    normalized.includes('total games') ||
    normalized.includes('total rounds') ||
    /\bo\/u\b/.test(normalized) ||
    /over\/under/.test(normalized) ||
    /\+\d+\.5/.test(normalized) ||
    /-\d+\.5/.test(normalized)
  );
}

function isMapOrGameWinnerMarket(market: Market): boolean {
  return /(?:Map|Game)\s+\d+\s+Winner/i.test(market.question);
}

function isLocalPracticeSeriesMarket(market: Market): boolean {
  const tags = market.tags ?? [];
  if (tags.includes('map-winner')) return false;
  if (!tags.includes('local-sim') && !tags.includes('local-seed')) return false;
  if (!tags.includes('cs2')) return false;
  const parsed = parsePolymarketMatch(market.question);
  return Boolean(parsed && !parsed.isMapMarket);
}
