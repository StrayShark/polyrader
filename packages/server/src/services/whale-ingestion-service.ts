import { PolygonClient, PolymarketDataClient, WhaleRepository, MarketRepository } from '@polyrader/infra';
import type { LogEntry } from '@polyrader/infra';
import { WhaleScoringEngine, type PolymarketPublicTrade, type WhaleTrade } from '@polyrader/core';
import { logger } from '../utils/logger';
import type { WalletFollowService } from './wallet-follow-service';

/**
 * Ingests whale trading data from Polygon chain.
 *
 * Scans the Polymarket CTF Exchange contract for large trades
 * and stores them in the local SQLite database.
 */

// Polymarket CTF Exchange contract on Polygon
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// OrderFilled event signature
const ORDER_FILLED_TOPIC = '0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb';

// Minimum USDC value to be considered a "whale" trade
const MIN_TRADE_VALUE = 500;

export interface WhaleIngestionStatus {
  lastScanAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  lastIngestedCount: number;
  source: 'data-api' | 'polygon' | null;
  lastWarning: string | null;
}

export class WhaleIngestionService {
  private client = new PolygonClient();
  private dataClient = new PolymarketDataClient();
  private repo = new WhaleRepository();
  private marketRepo = new MarketRepository();
  private scoringEngine = new WhaleScoringEngine();
  private walletFollowService?: WalletFollowService;
  // Cache tokenId → outcome to avoid querying all markets for every trade log
  private tokenOutcomeCache = new Map<string, string>();
  private status: WhaleIngestionStatus = {
    lastScanAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    lastError: null,
    lastIngestedCount: 0,
    source: null,
    lastWarning: null,
  };

  getStatus(): WhaleIngestionStatus {
    return { ...this.status };
  }

  setWalletFollowService(service: WalletFollowService): void {
    this.walletFollowService = service;
  }

  /**
   * Scan recent blocks for large Polymarket trades.
   * Processes the last ~500 blocks (~25 minutes on Polygon).
   */
  async scanRecentTrades(): Promise<number> {
    this.status.lastScanAt = new Date().toISOString();
    let dataApiError: string | null = null;

    try {
      const ingested = await this.scanDataApiTrades();
      this.markSuccess('data-api', ingested);
      return ingested;
    } catch (err) {
      dataApiError = (err as Error).message;
      logger.warn('[WhaleIngestion] Data API scan failed, falling back to Polygon', {
        error: dataApiError,
      });
    }

    try {
      const ingested = await this.scanPolygonTrades();
      this.markSuccess('polygon', ingested, dataApiError);
      return ingested;
    } catch (err) {
      this.status.consecutiveFailures += 1;
      this.status.lastError = [dataApiError, (err as Error).message].filter(Boolean).join(' | ');
      this.status.lastIngestedCount = 0;
      this.status.source = null;
      this.status.lastWarning = null;
      logger.error('[WhaleIngestion] Scan failed', {
        error: this.status.lastError,
        consecutiveFailures: this.status.consecutiveFailures,
      });
      return 0;
    }
  }

  private async scanDataApiTrades(): Promise<number> {
    const publicTrades = await this.dataClient.getPublicTrades(100, MIN_TRADE_VALUE);
    const followedTrades: PolymarketPublicTrade[] = [];
    const followed = this.walletFollowService?.listFollowed().slice(0, 30) ?? [];

    await Promise.all(followed.map(async (wallet) => {
      try {
        const trades = await this.dataClient.getTrades(wallet.address, 100);
        for (const trade of trades) {
          if (!trade.assetId || !trade.txHash || !trade.side || trade.value < MIN_TRADE_VALUE) continue;
          followedTrades.push({
            address: wallet.address.toLowerCase(),
            txHash: trade.txHash,
            tokenId: trade.assetId,
            conditionId: trade.marketId,
            outcome: trade.outcome,
            side: trade.side,
            price: trade.price,
            size: trade.size,
            value: trade.value,
            timestamp: trade.timestamp,
            profileName: wallet.label,
          });
        }
      } catch (err) {
        logger.warn('[WhaleIngestion] Followed wallet refresh failed', {
          address: wallet.address,
          error: (err as Error).message,
        });
      }
    }));

    const unique = new Map<string, PolymarketPublicTrade>();
    for (const trade of [...publicTrades, ...followedTrades]) {
      unique.set(`${trade.address}:${trade.txHash}:${trade.tokenId}`, trade);
    }
    return this.ingestPublicTrades(Array.from(unique.values()));
  }

  private async ingestPublicTrades(trades: PolymarketPublicTrade[]): Promise<number> {
    const affected = new Map<string, string | undefined>();
    const insertedTrades: Array<{ address: string; trade: WhaleTrade }> = [];

    for (const trade of trades) {
      if (trade.value < MIN_TRADE_VALUE || !trade.address || !trade.txHash || !trade.tokenId) continue;
      const record: WhaleTrade = {
        txHash: trade.txHash,
        marketId: trade.tokenId,
        outcome: trade.outcome ?? this.lookupOutcome(trade.tokenId),
        amount: trade.value,
        price: trade.price,
        timestamp: trade.timestamp || new Date().toISOString(),
        type: trade.side,
      };
      if (this.repo.insertTrade({ address: trade.address.toLowerCase(), ...record })) {
        affected.set(trade.address.toLowerCase(), trade.profileName);
        insertedTrades.push({ address: trade.address.toLowerCase(), trade: record });
      }
    }

    for (const [address, label] of affected) {
      await this.updateWhaleAggregate(address, label);
    }
    for (const { address, trade } of insertedTrades) {
      if (!this.walletFollowService) continue;
      void this.walletFollowService.processNewWhaleTrade(address, trade).catch((err) => {
        logger.warn('Failed to process copy signal', { error: (err as Error).message });
      });
    }
    return insertedTrades.length;
  }

  private async scanPolygonTrades(): Promise<number> {
    const currentBlock = await this.client.getBlockNumber();
    const fromBlock = '0x' + Math.max(0, currentBlock - 500).toString(16);
    const toBlock = '0x' + currentBlock.toString(16);
    const logs = await this.client.getLogs({
      address: CTF_EXCHANGE,
      topics: [ORDER_FILLED_TOPIC],
      fromBlock,
      toBlock,
    });

    let ingested = 0;
    for (const log of logs) {
      try {
        const trade = this.parseTradeLog(log);
        if (!trade || trade.amount < MIN_TRADE_VALUE) continue;
        const timestamp = new Date().toISOString();
        const tradeRecord: WhaleTrade = {
          txHash: log.transactionHash,
          marketId: trade.tokenId,
          outcome: trade.outcome,
          amount: trade.amount,
          price: trade.price,
          timestamp,
          type: trade.side,
        };
        if (!this.repo.insertTrade({ address: trade.maker.toLowerCase(), ...tradeRecord })) continue;
        await this.updateWhaleAggregate(trade.maker.toLowerCase());
        if (this.walletFollowService) {
          void this.walletFollowService.processNewWhaleTrade(trade.maker, tradeRecord).catch((err) => {
            logger.warn('Failed to process copy signal', { error: (err as Error).message });
          });
        }
        ingested += 1;
      } catch (err) {
        logger.warn('Failed to ingest whale trade', { error: (err as Error).message });
      }
    }
    return ingested;
  }

  private markSuccess(source: 'data-api' | 'polygon', ingested: number, warning: string | null = null): void {
    this.status.lastSuccessAt = new Date().toISOString();
    this.status.consecutiveFailures = 0;
    this.status.lastError = null;
    this.status.lastIngestedCount = ingested;
    this.status.source = source;
    this.status.lastWarning = warning;
  }

  /**
   * Parse a raw OrderFilled log into a structured trade.
   */
  private parseTradeLog(log: LogEntry): {
    maker: string;
    taker: string;
    tokenId: string;
    outcome: string;
    amount: number;
    price: number;
    side: 'buy' | 'sell';
  } | null {
    const data = log.data ?? '';
    const topics = log.topics ?? [];

    if (topics.length < 4 || data.length < 2) return null;

    // Strip 0x prefix from data
    const raw = data.startsWith('0x') ? data.slice(2) : data;
    if (raw.length < 256) return null; // Need 4 × 64 hex chars

    // Decode maker address from topics[2] (last 20 bytes = 40 hex chars)
    const maker = '0x' + (topics[2] ?? '').slice(26);
    // Decode taker address from topics[3] (last 20 bytes = 40 hex chars)
    const taker = '0x' + (topics[3] ?? '').slice(26);

    // Decode 4 uint256 from data (using BigInt for safety)
    const makerAssetId = BigInt('0x' + raw.slice(0, 64));
    const takerAssetId = BigInt('0x' + raw.slice(64, 128));
    const makerAmountFilled = BigInt('0x' + raw.slice(128, 192));
    const takerAmountFilled = BigInt('0x' + raw.slice(192, 256));

    // Determine side and extract tokenId
    // assetId == 0 means USDC (collateral)
    let side: 'buy' | 'sell';
    let tokenId: string;
    let usdcAmount: bigint;
    let shareAmount: bigint;

    if (makerAssetId === 0n) {
      // Maker gives USDC, receives shares → buy
      side = 'buy';
      tokenId = takerAssetId.toString();
      usdcAmount = makerAmountFilled;
      shareAmount = takerAmountFilled;
    } else if (takerAssetId === 0n) {
      // Maker gives shares, receives USDC → sell
      side = 'sell';
      tokenId = makerAssetId.toString();
      usdcAmount = takerAmountFilled;
      shareAmount = makerAmountFilled;
    } else {
      // Both non-zero: share-to-share trade (rare on Polymarket)
      // No USDC involved — can't determine dollar amount
      side = 'buy';
      tokenId = makerAssetId.toString();
      usdcAmount = 0n;
      shareAmount = makerAmountFilled;
    }

    // Convert from 6 decimals to human-readable
    const amount = Number(usdcAmount) / 1e6;
    const shares = Number(shareAmount) / 1e6;
    const price = shares > 0 ? amount / shares : 0;

    // Determine outcome (Yes/No) by looking up tokenId in market clobTokenIds
    const outcome = this.lookupOutcome(tokenId);

    return {
      maker,
      taker,
      tokenId,
      outcome,
      amount,
      price,
      side,
    };
  }

  /**
   * Look up the outcome (Yes/No) for a given tokenId by checking
   * market clobTokenIds in the database.
   */
  private lookupOutcome(tokenId: string): string {
    if (this.tokenOutcomeCache.has(tokenId)) {
      return this.tokenOutcomeCache.get(tokenId)!;
    }
    let outcome = 'Unknown';
    try {
      // Search all markets for a matching clobTokenId
      const markets = this.marketRepo.findAll(500);
      for (const market of markets) {
        if (market.clobTokenIds) {
          const idx = market.clobTokenIds.indexOf(tokenId);
          if (idx >= 0 && market.outcomes[idx]) {
            outcome = market.outcomes[idx];
            break;
          }
        }
      }
    } catch {
      // DB lookup failed
    }
    this.tokenOutcomeCache.set(tokenId, outcome);
    return outcome;
  }

  /**
   * Get recent whales sorted by last activity.
   */
  getRecentWhales(limit = 20) {
    return this.repo.findAll(limit);
  }

  /**
   * Get recent trades for a specific whale address.
   */
  getRecentTrades(address: string, limit = 10) {
    return this.repo.getTrades(address, limit);
  }

  /**
   * Update the whale aggregate row after a new trade.
   */
  private async updateWhaleAggregate(address: string, label?: string): Promise<void> {
    const trades = this.repo.getTrades(address, 100);
    const existing = this.repo.findByAddress(address);

    const totalVolume = trades.reduce((sum, t) => sum + t.amount, 0);
    const activePositions = new Set(trades.map((t) => t.marketId)).size;

    const whale = this.scoringEngine.scoreWhale(
      address,
      trades,
      totalVolume,
      activePositions,
      existing?.winRate ?? 0,
      existing?.pnl ?? 0,
    );

    this.repo.upsert({
      address,
      label: label ?? existing?.label,
      totalVolume,
      totalPositions: trades.length,
      activePositions,
      winRate: existing?.winRate ?? 0,
      pnl: existing?.pnl ?? 0,
      suspiciousScore: whale.suspiciousScore,
      recentTrades: trades.slice(0, 10),
      lastActive: trades[0]?.timestamp ?? new Date().toISOString(),
    });
  }
}

/** Shared instance for cron + health monitoring */
export const sharedWhaleIngestion = new WhaleIngestionService();
