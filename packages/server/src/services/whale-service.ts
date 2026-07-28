import type {
  Whale,
  AddressGraph,
  WhaleDetail,
  PolymarketUserPosition,
  WhaleTrade,
} from '@polyrader/core';
import { WhaleScoringEngine } from '@polyrader/core';
import {
  WhaleRepository,
  PolymarketDataClient,
  MarketRepository,
  PolymarketGammaClient,
} from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { WalletPerformanceService } from './wallet-performance-service';
import { calculateClosedPositionPerformance } from './smart-wallet-discovery-service';
import { logger } from '../utils/logger';

export class WhaleService {
  private engine = new WhaleScoringEngine();
  private whaleRepo = new WhaleRepository();
  private marketRepo = new MarketRepository();
  private performanceService = new WalletPerformanceService();
  private dataClient = new PolymarketDataClient();
  private gammaClient = new PolymarketGammaClient();

  async getWhales(options: {
    limit?: number;
    sort?: 'volume' | 'win_rate';
    minSamples?: number;
    minWinRate?: number;
    minRoi?: number;
  } = {}): Promise<Whale[]> {
    const limit = options.limit ?? 50;
    const sort = options.sort ?? 'volume';
    const minSamples = options.minSamples ?? 5;
    const minWinRate = options.minWinRate ?? 0;
    const minRoi = options.minRoi ?? (sort === 'win_rate' ? -1 : 0);
    const cacheKey = `whales:${sort}:${limit}:${minSamples}:${minWinRate}:${minRoi}`;
    const cached = await cacheGet<Whale[]>(cacheKey);
    if (cached) return cached;

    const whales = sort === 'win_rate'
      ? this.whaleRepo.findByWinRate(limit, minSamples, minWinRate, minRoi)
      : this.whaleRepo.findAll(limit);

    // Re-score each whale with fresh correlation data from the DB.
    // The engine requires trades + correlation data for accurate scoring.
    const scored = whales.map((w) => {
      const trades = this.whaleRepo.getTrades(w.address, 100);
      const correlationData = this.whaleRepo.findCorrelationData(w.address);
      const rescored = this.engine.scoreWhale(
        w.address,
        trades,
        w.totalVolume,
        w.activePositions,
        w.winRate,
        w.pnl,
        correlationData,
      );
      return {
        ...w,
        suspiciousScore: rescored.suspiciousScore,
        recentTrades: trades.length > 0 ? trades.slice(0, 20) : w.recentTrades,
      };
    });

    const ranked = sort === 'win_rate'
      ? scored.sort((a, b) => b.winRate - a.winRate || (b.settledBets ?? 0) - (a.settledBets ?? 0) || b.pnl - a.pnl)
      : scored.sort((a, b) => b.totalVolume - a.totalVolume);

    await cacheSet(cacheKey, ranked, 120);
    return ranked;
  }

  async getWhale(address: string): Promise<Whale | null> {
    const cacheKey = `whale:${address}`;
    const cached = await cacheGet<Whale>(cacheKey);
    if (cached) return cached;

    const whale = await this.whaleRepo.findByAddress(address);
    if (whale) {
      await cacheSet(cacheKey, whale, 120);
    }
    return whale;
  }

  async getWhaleDetail(address: string): Promise<WhaleDetail | null> {
    const normalized = address.toLowerCase();
    let whale = await this.getWhale(normalized);
    if (!whale) {
      const trades = this.whaleRepo.getTrades(normalized, 1);
      if (trades.length === 0) {
        const performance = await this.getClosedPositionPerformance(normalized);
        if (!performance) return null;
        whale = this.createWhaleFromPerformance(normalized, performance);
        this.whaleRepo.upsert(whale);
        this.whaleRepo.updatePerformance(normalized, {
          winRate: performance.winRate,
          totalPnl: performance.totalPnl,
          settledBets: performance.settledBets,
          wins: performance.wins,
          losses: performance.losses,
          totalWagered: performance.totalWagered,
          roi: performance.roi,
        });
      } else {
        whale = this.engine.scoreWhale(
          normalized,
          this.whaleRepo.getTrades(normalized, 100),
          trades.reduce((sum, t) => sum + t.amount, 0),
          1,
          0,
          0,
        );
      }
    } else {
      const trades = this.whaleRepo.getTrades(normalized, 100);
      const correlationData = this.whaleRepo.findCorrelationData(normalized);
      whale = this.engine.scoreWhale(
        normalized,
        trades,
        whale.totalVolume,
        whale.activePositions,
        whale.winRate,
        whale.pnl,
        correlationData,
      );
    }

    const detail = this.performanceService.buildWhaleDetail(normalized, whale);
    if (!detail.performance || detail.performance.settledBets === 0) {
      const performance = await this.getClosedPositionPerformance(normalized);
      if (performance) {
        this.applyPerformance(detail, performance);
        this.whaleRepo.updatePerformance(normalized, {
          winRate: performance.winRate,
          totalPnl: performance.totalPnl,
          settledBets: performance.settledBets,
          wins: performance.wins,
          losses: performance.losses,
          totalWagered: performance.totalWagered,
          roi: performance.roi,
        });
      }
    }
    detail.recentTrades = await this.getEnrichedRecentTrades(normalized, detail.recentTrades);
    return detail;
  }

  async getWhalePositions(address: string, limit = 50): Promise<PolymarketUserPosition[]> {
    const normalized = address.toLowerCase();
    const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const cacheKey = `whale:positions:${normalized}:${cappedLimit}`;
    const cached = await cacheGet<PolymarketUserPosition[]>(cacheKey);
    if (cached) return cached;

    const positions = await this.dataClient.getCurrentPositions(normalized, cappedLimit);
    const sorted = positions.sort((a, b) => b.value - a.value);
    await cacheSet(cacheKey, sorted, 60);
    return sorted;
  }

  private async getEnrichedRecentTrades(address: string, fallback: WhaleTrade[]): Promise<WhaleTrade[]> {
    const cacheKey = `whale:recent-trades:${address}:20`;
    const cached = await cacheGet<WhaleTrade[]>(cacheKey);
    if (cached) return cached;

    try {
      const localQuestionByToken = new Map<string, string>();
      for (const trade of fallback) {
        if (trade.marketQuestion || localQuestionByToken.has(trade.marketId)) continue;
        const market = this.marketRepo.findByTokenId(trade.marketId);
        if (market?.question) localQuestionByToken.set(trade.marketId, market.question);
      }

      const trades = await this.dataClient.getTrades(address, 500);
      const apiTrades = trades
        .filter((trade) => trade.txHash || trade.id)
        .map((trade): WhaleTrade => ({
          txHash: trade.txHash ?? trade.id,
          marketId: trade.assetId ?? trade.marketId ?? trade.id,
          marketQuestion: trade.question,
          outcome: trade.outcome ?? '--',
          amount: trade.value,
          price: trade.price,
          timestamp: trade.timestamp,
          type: trade.side ?? 'buy',
        }));

      const questionByTradeKey = new Map<string, string>();
      const questionByTxHash = new Map<string, string>();
      for (const trade of apiTrades) {
        if (!trade.marketQuestion) continue;
        questionByTradeKey.set(`${trade.txHash}:${trade.marketId}`, trade.marketQuestion);
        questionByTxHash.set(trade.txHash, trade.marketQuestion);
      }

      let enriched = fallback.length > 0
        ? fallback.map((trade) => ({
          ...trade,
          marketQuestion: trade.marketQuestion
            ?? localQuestionByToken.get(trade.marketId)
            ?? questionByTradeKey.get(`${trade.txHash}:${trade.marketId}`)
            ?? questionByTxHash.get(trade.txHash),
        }))
        : apiTrades.slice(0, 20);

      const unresolved = new Map<string, WhaleTrade>();
      for (const trade of enriched) {
        if (!trade.marketQuestion && trade.marketId && !unresolved.has(trade.marketId)) {
          unresolved.set(trade.marketId, trade);
        }
        if (unresolved.size >= 8) break;
      }
      if (unresolved.size > 0) {
        const resolved = new Map<string, string>();
        await Promise.all([...unresolved.values()].map(async (trade) => {
          const question = await this.resolveMarketQuestionByToken(trade.marketId, trade.outcome);
          if (question) resolved.set(trade.marketId, question);
        }));
        if (resolved.size > 0) {
          enriched = enriched.map((trade) => ({
            ...trade,
            marketQuestion: trade.marketQuestion ?? resolved.get(trade.marketId),
          }));
        }
      }

      if (enriched.length > 0) {
        await cacheSet(cacheKey, enriched, 60);
        return enriched;
      }
    } catch (err) {
      logger.warn('Failed to enrich whale recent trades', {
        address,
        error: (err as Error).message,
      });
    }

    await cacheSet(cacheKey, fallback, 60);
    return fallback;
  }

  private async resolveMarketQuestionByToken(tokenId: string, hint?: string): Promise<string | undefined> {
    const cacheKey = `market:question:token:${tokenId}`;
    const cached = await cacheGet<string>(cacheKey);
    if (cached) return cached;

    try {
      const market = await withTimeout(
        this.gammaClient.getMarketByTokenId(tokenId, hint),
        5000,
      );
      if (market?.question) {
        await cacheSet(cacheKey, market.question, 3600);
        return market.question;
      }
    } catch (err) {
      logger.warn('Failed to resolve market question by token', {
        tokenId,
        error: (err as Error).message,
      });
    }
    return undefined;
  }

  private async getClosedPositionPerformance(address: string): Promise<WhaleDetail['performance'] | undefined> {
    const cacheKey = `whale:closed-position-performance:${address}`;
    const cached = await cacheGet<WhaleDetail['performance']>(cacheKey);
    if (cached) return cached;

    try {
      const positions = await withTimeout(
        this.dataClient.getClosedPositions(address, 200),
        10000,
      );
      const metrics = calculateClosedPositionPerformance(positions);
      if (metrics.settledBets === 0) return undefined;
      const performance = { ...metrics, pendingTrades: 0 };
      await cacheSet(cacheKey, performance, 300);
      return performance;
    } catch (err) {
      logger.warn('Failed to query closed-position win rate', {
        address,
        error: (err as Error).message,
      });
      return undefined;
    }
  }

  private createWhaleFromPerformance(address: string, performance: NonNullable<WhaleDetail['performance']>): Whale {
    const scored = this.engine.scoreWhale(
      address,
      [],
      performance.totalWagered,
      0,
      performance.winRate,
      performance.totalPnl,
    );
    return {
      ...scored,
      totalVolume: performance.totalWagered,
      totalPositions: performance.settledBets,
      activePositions: 0,
      winRate: performance.winRate,
      pnl: performance.totalPnl,
      settledBets: performance.settledBets,
      wins: performance.wins,
      losses: performance.losses,
      totalWagered: performance.totalWagered,
      roi: performance.roi,
      performanceUpdatedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };
  }

  private applyPerformance(detail: WhaleDetail, performance: NonNullable<WhaleDetail['performance']>): void {
    detail.performance = performance;
    detail.winRate = performance.winRate;
    detail.pnl = performance.totalPnl;
    detail.settledBets = performance.settledBets;
    detail.wins = performance.wins;
    detail.losses = performance.losses;
    detail.totalWagered = performance.totalWagered;
    detail.roi = performance.roi;
    detail.performanceUpdatedAt = new Date().toISOString();
  }

  async getAddressGraph(): Promise<AddressGraph> {
    const cacheKey = 'whales:graph';
    const cached = await cacheGet<AddressGraph>(cacheKey);
    if (cached) return cached;

    const graph = this.whaleRepo.getAddressGraph();
    await cacheSet(cacheKey, graph, 120);
    return graph;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
