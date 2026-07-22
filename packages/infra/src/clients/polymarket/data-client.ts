import type {
  PolymarketHolder,
  PolymarketLeaderboardEntry,
  PolymarketMarketPosition,
  PolymarketPublicTrade,
  PolymarketUserActivity,
  PolymarketUserPosition,
  PolymarketUserTrade,
} from '@polyrader/core';
import { fetchJsonWithBrowser } from '../../crawlers/browser-fetch.js';

const DATA_API_URL = process.env.POLYMARKET_DATA_API_URL ?? 'https://data-api.polymarket.com';
let preferBrowserUntil = 0;

async function fetchJson<T>(url: string, timeoutMs = envNumber('POLYMARKET_DATA_API_TIMEOUT_MS', 8000)): Promise<T> {
  if (Date.now() < preferBrowserUntil && process.env.POLYMARKET_DISABLE_BROWSER_FETCH !== '1') {
    return fetchJsonWithBrowser<T>(url, { timeoutMs });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Polymarket Data API error: ${response.status} ${response.statusText}`);
    }
    preferBrowserUntil = 0;
    return response.json() as Promise<T>;
  } catch (err) {
    if (process.env.POLYMARKET_DISABLE_BROWSER_FETCH === '1') {
      throw err;
    }
    preferBrowserUntil = Date.now() + 5 * 60 * 1000;
    return fetchJsonWithBrowser<T>(url, { timeoutMs });
  } finally {
    clearTimeout(timer);
  }
}

export class PolymarketDataClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DATA_API_URL;
  }

  async fetch<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return fetchJson<T>(url.toString());
  }

  async getHolders(marketId: string, limit = 50): Promise<PolymarketHolder[]> {
    const data = await this.fetch<unknown[]>('/holders', {
      market: marketId,
      limit,
    });
    return data.map((item) => this.mapHolder(item as Record<string, unknown>));
  }

  async getMarketPositions(marketId: string, limit = 100): Promise<PolymarketMarketPosition[]> {
    const data = await this.fetch<unknown[]>('/market-positions', {
      market: marketId,
      limit,
    });
    return data.map((item) => this.mapMarketPosition(item as Record<string, unknown>, marketId));
  }

  async getCurrentPositions(user: string, limit = 100): Promise<PolymarketUserPosition[]> {
    const data = await this.fetch<unknown[]>('/positions', {
      user,
      limit,
    });
    return data.map((item) => this.mapUserPosition(item as Record<string, unknown>));
  }

  async getClosedPositions(user: string, limit = 100): Promise<PolymarketUserPosition[]> {
    const data = await this.fetch<unknown[]>('/closed-positions', {
      user,
      limit,
      sortBy: 'TIMESTAMP',
      sortDirection: 'DESC',
    });
    return data.map((item) => this.mapUserPosition(item as Record<string, unknown>));
  }

  async getActivity(user: string, limit = 100): Promise<PolymarketUserActivity[]> {
    const data = await this.fetch<unknown[]>('/activity', {
      user,
      limit,
    });
    return data.map((item) => this.mapActivity(item as Record<string, unknown>));
  }

  async getTrades(user: string, limit = 100): Promise<PolymarketUserTrade[]> {
    const data = await this.fetch<unknown[]>('/trades', {
      user,
      limit,
    });
    return data.map((item) => this.mapTrade(item as Record<string, unknown>));
  }

  async getPublicTrades(limit = 100, minValue = 500): Promise<PolymarketPublicTrade[]> {
    const data = await this.fetch<unknown[]>('/trades', {
      limit,
      filterType: 'CASH',
      filterAmount: minValue,
    });
    return data
      .map((item) => this.mapPublicTrade(item as Record<string, unknown>))
      .filter((trade) => trade.address && trade.txHash && trade.tokenId && trade.value >= minValue);
  }

  async getLeaderboard(options: {
    limit?: number;
    offset?: number;
    category?: 'OVERALL' | 'POLITICS' | 'SPORTS' | 'CRYPTO';
    timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
    orderBy?: 'PNL' | 'VOL';
  } = {}): Promise<PolymarketLeaderboardEntry[]> {
    const data = await this.fetch<unknown[]>('/v1/leaderboard', {
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      category: options.category ?? 'OVERALL',
      timePeriod: options.timePeriod ?? 'ALL',
      orderBy: options.orderBy ?? 'PNL',
    });
    return data
      .map((item) => this.mapLeaderboardEntry(item as Record<string, unknown>))
      .filter((entry) => entry.address);
  }

  async getTotalValue(user: string): Promise<number> {
    const data = await this.fetch<unknown>('/value', { user });
    if (typeof data === 'number') return data;
    const row = data as Record<string, unknown>;
    return numberFrom(row.value ?? row.totalValue ?? row.total ?? row.balance);
  }

  private mapHolder(row: Record<string, unknown>): PolymarketHolder {
    return {
      address: stringFrom(row.address ?? row.user ?? row.proxyWallet ?? row.wallet),
      outcome: optionalString(row.outcome ?? row.title),
      tokenId: optionalString(row.tokenId ?? row.asset ?? row.assetId),
      shares: numberFrom(row.shares ?? row.size ?? row.amount),
      value: numberFrom(row.value ?? row.usdcValue ?? row.currentValue),
      avgPrice: optionalNumber(row.avgPrice ?? row.averagePrice),
      percentage: optionalNumber(row.percentage ?? row.pct ?? row.share),
    };
  }

  private mapMarketPosition(row: Record<string, unknown>, marketId: string): PolymarketMarketPosition {
    return {
      address: stringFrom(row.address ?? row.user ?? row.proxyWallet ?? row.wallet),
      marketId: stringFrom(row.market ?? row.marketId ?? row.conditionId ?? marketId),
      outcome: stringFrom(row.outcome ?? row.title),
      tokenId: optionalString(row.tokenId ?? row.asset ?? row.assetId),
      shares: numberFrom(row.shares ?? row.size ?? row.amount),
      value: numberFrom(row.value ?? row.usdcValue ?? row.currentValue),
      avgPrice: optionalNumber(row.avgPrice ?? row.averagePrice),
      currentPrice: optionalNumber(row.currentPrice ?? row.price),
      unrealizedPnl: optionalNumber(row.unrealizedPnl ?? row.pnl ?? row.cashPnl),
    };
  }

  private mapUserPosition(row: Record<string, unknown>): PolymarketUserPosition {
    const avgPrice = optionalNumber(row.avgPrice ?? row.averagePrice);
    const totalBought = optionalNumber(row.totalBought);
    const initialValue = optionalNumber(row.initialValue ?? row.costBasis)
      ?? (avgPrice !== undefined && totalBought !== undefined ? avgPrice * totalBought : undefined);
    return {
      marketId: stringFrom(row.market ?? row.marketId ?? row.conditionId),
      conditionId: optionalString(row.conditionId),
      question: stringFrom(row.question ?? row.title ?? row.marketQuestion),
      outcome: stringFrom(row.outcome ?? row.outcomeTitle ?? row.title),
      tokenId: optionalString(row.tokenId ?? row.asset ?? row.assetId),
      shares: numberFrom(row.shares ?? row.size ?? row.amount),
      value: numberFrom(row.value ?? row.currentValue ?? row.usdcValue),
      avgPrice,
      currentPrice: optionalNumber(row.currentPrice ?? row.curPrice ?? row.price),
      initialValue,
      cashPnl: optionalNumber(row.cashPnl ?? row.realizedPnl ?? row.pnl),
      percentPnl: optionalNumber(row.percentPnl ?? row.percentPnL),
      endDate: optionalString(row.endDate),
    };
  }

  private mapActivity(row: Record<string, unknown>): PolymarketUserActivity {
    return {
      id: stringFrom(row.id ?? row.transactionHash ?? row.txHash ?? `${row.timestamp ?? ''}-${row.type ?? ''}`),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      question: optionalString(row.question ?? row.title ?? row.marketQuestion),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      type: stringFrom(row.type ?? row.activityType),
      side: normalizeSide(row.side ?? row.type),
      price: optionalNumber(row.price),
      size: optionalNumber(row.size ?? row.shares ?? row.amount),
      value: optionalNumber(row.value ?? row.usdcValue),
      timestamp: normalizeTimestamp(row.timestamp ?? row.createdAt ?? row.time),
      txHash: optionalString(row.transactionHash ?? row.txHash),
    };
  }

  private mapTrade(row: Record<string, unknown>): PolymarketUserTrade {
    const size = numberFrom(row.size ?? row.shares ?? row.amount);
    const price = numberFrom(row.price);
    return {
      id: stringFrom(row.id ?? row.tradeId ?? row.transactionHash ?? row.txHash),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      assetId: optionalString(row.asset ?? row.assetId ?? row.tokenId),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side ?? row.type),
      price,
      size,
      value: numberFrom(row.value ?? row.usdcValue) || price * size,
      fee: optionalNumber(row.fee),
      status: optionalString(row.status),
      timestamp: normalizeTimestamp(row.timestamp ?? row.createdAt ?? row.time),
      txHash: optionalString(row.transactionHash ?? row.txHash),
    };
  }

  private mapPublicTrade(row: Record<string, unknown>): PolymarketPublicTrade {
    const price = numberFrom(row.price);
    const size = numberFrom(row.size ?? row.shares ?? row.amount);
    return {
      address: stringFrom(row.proxyWallet ?? row.address ?? row.user ?? row.wallet).toLowerCase(),
      txHash: stringFrom(row.transactionHash ?? row.txHash ?? row.id),
      tokenId: stringFrom(row.asset ?? row.assetId ?? row.tokenId),
      conditionId: optionalString(row.conditionId ?? row.market),
      question: optionalString(row.title ?? row.question ?? row.marketQuestion),
      slug: optionalString(row.slug),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side ?? row.type) ?? 'buy',
      price,
      size,
      value: numberFrom(row.value ?? row.usdcValue) || price * size,
      timestamp: normalizeTimestamp(row.timestamp ?? row.createdAt ?? row.time),
      profileName: optionalString(row.name ?? row.pseudonym ?? row.userName),
    };
  }

  private mapLeaderboardEntry(row: Record<string, unknown>): PolymarketLeaderboardEntry {
    return {
      rank: numberFrom(row.rank),
      address: stringFrom(row.proxyWallet ?? row.address ?? row.user).toLowerCase(),
      userName: optionalString(row.userName ?? row.name ?? row.pseudonym),
      volume: numberFrom(row.vol ?? row.volume),
      pnl: numberFrom(row.pnl ?? row.profit),
      profileImage: optionalString(row.profileImage),
    };
  }
}

function normalizeSide(value: unknown): 'buy' | 'sell' | undefined {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('buy') || text === 'b') return 'buy';
  if (text.includes('sell') || text === 's') return 'sell';
  return undefined;
}

function stringFrom(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function optionalString(value: unknown): string | undefined {
  const text = stringFrom(value);
  return text ? text : undefined;
}

function numberFrom(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function optionalNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value ?? ''))) {
    const numeric = Number(value);
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(millis).toISOString();
  }
  return stringFrom(value);
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? process.env.POLYRADER_EXTERNAL_TIMEOUT_MS);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30000, Math.max(250, value));
}
