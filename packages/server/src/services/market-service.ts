import type { Market, PolymarketHolder, PolymarketMarketPosition } from '@polyrader/core';
import { PolymarketGammaClient, PolymarketClobClient, PolymarketDataClient } from '@polyrader/infra';
import type { OrderBookSummary } from '@polyrader/infra';
import { MarketRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { RequestDedup } from './request-dedup';
import { AlertService } from './alert-service';
import { getLocalSeedMarkets } from './local-seed-data';
import { isOpenMarket } from './market-eligibility';
import { broadcast } from '../websocket';
import { logger } from '../utils/logger';
import { envNumber, withTimeout } from '../utils/timeout';
import { mergeCanonicalMarkets, withCanonicalMarketId } from './canonical-market-merge';

const CACHE_TTL = 60; // 1 minute
const ORDERBOOK_CACHE_TTL = 10; // 10 seconds for orderbook

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
    const cacheKey = `markets:${limit}:${offset}`;
    const cached = await cacheGet<Market[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const markets = await withTimeout(
          this.gammaClient.getMarkets(limit, offset),
          marketTimeoutMs(),
          `polymarket gamma markets ${limit}:${offset}`,
        );
        const openMarkets = markets.filter((market) => isOpenMarket(market));
        if (openMarkets.length === 0) {
          logger.info('Polymarket returned no open markets, falling back to local practice markets', { cacheKey });
          const fallbackMarkets = await this.getDbOrSeedMarkets(limit, offset);
          await cacheSet(cacheKey, fallbackMarkets, CACHE_TTL);
          return fallbackMarkets;
        }
        for (const market of openMarkets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', { conditionId: market.conditionId, error: (err as Error).message });
          }
        }
        const localMarkets = (await Promise.resolve(this.marketRepo.findAll(200, 0)) ?? [])
          .filter((market) => isOpenMarket(market));
        const merged = mergeCanonicalMarkets([...localMarkets, ...openMarkets]).slice(offset, offset + limit);
        for (const market of merged) {
          if (market.canonicalMatchId && market.match) this.marketRepo.upsert(market);
        }
        await cacheSet(cacheKey, merged, CACHE_TTL);
        this.checkPriceAlerts(merged);
        return merged;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', { cacheKey, error: (err as Error).message });
        return this.getDbOrSeedMarkets(limit, offset);
      }
    }) as Promise<Market[]>;
  }

  async getMarket(conditionId: string): Promise<Market | null> {
    const cacheKey = `market:${conditionId}`;
    const cached = await cacheGet<Market>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      const stored = this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
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
            logger.warn('Failed to upsert market to DB', { conditionId, error: (err as Error).message });
          }
        }
        return market;
      } catch (err) {
        logger.warn('Polymarket API failed, falling back to DB', { conditionId, error: (err as Error).message });
        const dbMarket = await Promise.resolve(this.marketRepo.findByConditionId(conditionId));
        return dbMarket ?? getLocalSeedMarkets(100, 0).find((market) => market.conditionId === conditionId) ?? null;
      }
    }) as Promise<Market | null>;
  }

  async getPriceHistory(conditionId: string): Promise<Array<{ timestamp: string; price: number }>> {
    return this.dedup.run(`pricehistory:${conditionId}`, async () => {
      const stored = this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
      if (stored?.tags?.includes('local-sim')) {
        return this.marketRepo.getPriceHistory(stored.conditionId, 100).reverse();
      }
      try {
        return await withTimeout(
          this.gammaClient.getPriceHistory(conditionId),
          marketTimeoutMs(),
          `polymarket gamma price history ${conditionId}`,
        );
      } catch (err) {
        logger.warn('Failed to fetch price history', { conditionId, error: (err as Error).message });
        return [];
      }
    }) as Promise<Array<{ timestamp: string; price: number }>>;
  }

  async refreshMarkets(): Promise<Market[]> {
    return this.dedup.run('refresh:markets', async () => {
      try {
        const markets = await withTimeout(
          this.gammaClient.getMarkets(100, 0),
          marketTimeoutMs(),
          'polymarket gamma refresh markets',
        );
        const openMarkets = markets.filter((market) => isOpenMarket(market));
        if (openMarkets.length === 0) {
          logger.info('Polymarket refresh returned no open markets, preserving local practice markets');
          const fallbackMarkets = await this.getDbOrSeedMarkets(100, 0);
          await cacheSet('markets:50:0', fallbackMarkets.slice(0, 50), CACHE_TTL);
          return fallbackMarkets;
        }
        for (const market of openMarkets) {
          try {
            this.marketRepo.upsert(market);
          } catch (err) {
            logger.warn('Failed to upsert market to DB', { conditionId: market.conditionId, error: (err as Error).message });
          }
        }
        const localMarkets = (await Promise.resolve(this.marketRepo.findAll(200, 0)) ?? [])
          .filter((market) => isOpenMarket(market));
        const merged = mergeCanonicalMarkets([...localMarkets, ...openMarkets]);
        for (const market of merged) {
          if (market.canonicalMatchId && market.match) this.marketRepo.upsert(market);
        }
        await cacheSet('markets:50:0', merged.slice(0, 50), CACHE_TTL);
        this.checkPriceAlerts(merged);
        return merged;
      } catch (err) {
        logger.error('Failed to refresh markets from Polymarket', { error: (err as Error).message });
        return this.getDbOrSeedMarkets(100, 0);
      }
    }) as Promise<Market[]>;
  }

  async getOrderBook(conditionId: string, tokenId?: string): Promise<OrderBookSummary | null> {
    const cacheKey = `orderbook:${conditionId}:${tokenId ?? 'default'}`;
    const cached = await cacheGet<OrderBookSummary>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const stored = this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
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
        logger.warn('Failed to fetch order book', { conditionId, tokenId, error: (err as Error).message });
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
    const market = this.marketRepo.findByConditionId(conditionId) ?? this.marketRepo.findBySlug(conditionId);
    if (!market?.tags?.includes('local-sim')) return null;
    const probabilities = market.outcomePrices.map((price) => Number(price));
    const history = this.marketRepo.getPriceHistory(market.conditionId, 100).reverse();
    return {
      conditionId: market.conditionId,
      source: 'local-sim',
      outcomes: market.outcomes,
      probabilities,
      decimalOdds: probabilities.map((probability) => probability > 0 ? 1 / probability : 0),
      capturedAt: history.at(-1)?.timestamp,
      history,
    };
  }

  async getHolders(conditionId: string, limit = 50): Promise<PolymarketHolder[]> {
    const cacheKey = `holders:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketHolder[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const holders = await this.dataClient.getHolders(conditionId, limit);
        await cacheSet(cacheKey, holders, 60);
        return holders;
      } catch (err) {
        logger.warn('Failed to fetch market holders', { conditionId, error: (err as Error).message });
        return [];
      }
    }) as Promise<PolymarketHolder[]>;
  }

  async getMarketPositions(conditionId: string, limit = 100): Promise<PolymarketMarketPosition[]> {
    const cacheKey = `market-positions:${conditionId}:${limit}`;
    const cached = await cacheGet<PolymarketMarketPosition[]>(cacheKey);
    if (cached) return cached;

    return this.dedup.run(cacheKey, async () => {
      try {
        const positions = await this.dataClient.getMarketPositions(conditionId, limit);
        await cacheSet(cacheKey, positions, 60);
        return positions;
      } catch (err) {
        logger.warn('Failed to fetch market positions', { conditionId, error: (err as Error).message });
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
        logger.warn('Price poll failed', { conditionId: market.conditionId, error: (err as Error).message });
      }
    }

    return updated;
  }

  private async getDbOrSeedMarkets(limit: number, offset: number): Promise<Market[]> {
    const dbMarkets = await Promise.resolve(this.marketRepo.findAll(limit, offset)) ?? [];
    const openDbMarkets = dbMarkets.filter((market) => isOpenMarket(market));
    if (openDbMarkets.length > 0) {
      const merged = mergeCanonicalMarkets(openDbMarkets);
      const unchanged = merged.length === dbMarkets.length
        && merged.every((market, index) => market === dbMarkets[index]);
      return unchanged ? dbMarkets : merged;
    }

    const seeds = getLocalSeedMarkets(limit, offset);
    if (seeds.length === 0) return [];

    for (const market of seeds) {
      try {
        this.marketRepo.upsert(market);
      } catch (err) {
        logger.warn('Failed to persist local seed market', { conditionId: market.conditionId, error: (err as Error).message });
      }
    }
    await cacheSet(`markets:${limit}:${offset}`, seeds, CACHE_TTL);
    return seeds;
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
  return envNumber('POLYRADER_MARKET_TIMEOUT_MS', envNumber('POLYRADER_EXTERNAL_TIMEOUT_MS', 8000, 250, 30000), 250, 30000);
}
