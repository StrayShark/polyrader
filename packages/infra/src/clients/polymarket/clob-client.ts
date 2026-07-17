import crypto from 'node:crypto';
import type {
  PolymarketBalance,
  PolymarketOpenOrder,
  PolymarketUserTrade,
} from '@polyrader/core';
import { fetchJsonWithBrowser } from '../../crawlers/browser-fetch.js';

const CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL ?? 'https://clob.polymarket.com';
const INITIAL_CURSOR = 'MA==';
const END_CURSOR = 'LTE=';

export interface OrderBookSummary {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  hash: string;
  timestamp: string;
}

export interface PriceHistory {
  history: Array<{
    t: number;
    p: number;
  }>;
}

export interface PolymarketClobCredentials {
  /**
   * Public account/profile/funder address used for dashboard data.
   */
  address?: string;
  /**
   * Polygon signer address used in CLOB L2 auth headers.
   */
  signerAddress?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
}

interface AuthenticatedRequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined> | URLSearchParams;
  signPath?: string;
}

export class PolymarketClobClient {
  private baseUrl: string;
  private credentials: PolymarketClobCredentials;

  constructor(baseUrl?: string, credentials?: PolymarketClobCredentials) {
    this.baseUrl = baseUrl ?? CLOB_API_URL;
    this.credentials = credentials ?? readCredentialsFromEnv();
  }

  async fetch<T>(path: string): Promise<T> {
    return fetchJsonWithBrowser<T>(`${this.baseUrl}${path}`, { timeoutMs: envNumber('POLYMARKET_CLOB_API_TIMEOUT_MS', 8000) });
  }

  async fetchAuthenticated<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: AuthenticatedRequestOptions = {},
  ): Promise<T> {
    const credentials = this.requireCredentials();
    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);
    const signPath = options.signPath ?? path;
    const headers = this.createAuthHeaders(method, signPath, bodyText, credentials);
    const queryText = buildQueryString(options.query);
    const url = `${this.baseUrl}${path}${queryText ? `?${queryText}` : ''}`;
    const requestHeaders = {
      ...headers,
      'Content-Type': 'application/json',
    };
    let response: Response;
    const timeoutMs = envNumber('POLYMARKET_CLOB_API_TIMEOUT_MS', 8000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: bodyText,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (method === 'GET' && process.env.POLYMARKET_DISABLE_BROWSER_FETCH !== '1') {
        return fetchJsonWithBrowser<T>(url, { headers: requestHeaders, timeoutMs });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`CLOB authenticated API error: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`);
    }
    return response.json() as Promise<T>;
  }

  getAccountStatus(): {
    hasApiCredentials: boolean;
    hasAddress: boolean;
    address?: string;
    hasSignerAddress: boolean;
    signerAddress?: string;
    canReadPrivate: boolean;
    message?: string;
  } {
    const hasApiCredentials = Boolean(
      this.credentials.apiKey &&
      this.credentials.apiSecret &&
      this.credentials.apiPassphrase,
    );
    const hasAddress = Boolean(this.credentials.address);
    const signerAddress = this.credentials.signerAddress ?? this.credentials.address;
    const hasSignerAddress = Boolean(signerAddress);
    return {
      hasApiCredentials,
      hasAddress,
      address: this.credentials.address,
      hasSignerAddress,
      signerAddress,
      canReadPrivate: hasApiCredentials && hasAddress && hasSignerAddress,
      message: !hasApiCredentials
        ? 'Polymarket L2 credentials are not configured'
        : !hasAddress
          ? 'Polymarket address is not configured'
          : !hasSignerAddress
            ? 'Polymarket signer address is not configured'
          : undefined,
    };
  }

  async probeReachability(tokenId?: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const probeToken = tokenId ?? process.env.POLYMARKET_PROBE_TOKEN_ID;
      if (probeToken) {
        await this.getMidpoint(probeToken);
      } else {
        await this.fetch<{ server_time?: number }>('/time');
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /**
   * Get order book for a token.
   */
  async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
    return this.fetch<OrderBookSummary>(`/book?token_id=${tokenId}`);
  }

  /**
   * Get price history for a token.
   */
  async getPriceHistory(
    tokenId: string,
    interval: '1h' | '6h' | '1d' | '1w' | 'max' = '1d',
  ): Promise<PriceHistory> {
    return this.fetch<PriceHistory>(
      `/prices-history?market=${tokenId}&interval=${interval}&fidelity=60`,
    );
  }

  /**
   * Get midpoint price for a token.
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const data = await this.fetch<{ mid: string }>(`/midpoint?token_id=${tokenId}`);
    return parseFloat(data.mid);
  }

  /**
   * Get spread for a token.
   */
  async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number }> {
    const book = await this.getOrderBook(tokenId);
    const bestBid = book.bids[0] ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks[0] ? parseFloat(book.asks[0].price) : 1;
    return {
      bid: bestBid,
      ask: bestAsk,
      spread: bestAsk - bestBid,
    };
  }

  async getOpenOrders(): Promise<PolymarketOpenOrder[]> {
    const orders = await this.fetchPaginated('/data/orders');
    return orders.map((item) => this.mapOrder(item as Record<string, unknown>));
  }

  async getAuthenticatedTrades(limit = 100): Promise<PolymarketUserTrade[]> {
    const trades = await this.fetchPaginated('/data/trades', limit);
    return trades.slice(0, limit).map((item) => this.mapTrade(item as Record<string, unknown>));
  }

  async getBalanceAllowance(assetType = 'COLLATERAL', tokenId?: string): Promise<PolymarketBalance> {
    const params = new URLSearchParams({
      asset_type: assetType,
      signature_type: envValue(process.env.POLYMARKET_SIGNATURE_TYPE) ?? '1',
    });
    if (tokenId) params.set('token_id', tokenId);
    const data = await this.fetchAuthenticated<Record<string, unknown>>('GET', '/balance-allowance', {
      query: params,
    });
    return {
      assetType,
      tokenId,
      balance: numberFrom(data.balance ?? data.amount),
      allowance: optionalNumber(data.allowance),
      raw: data,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.fetchAuthenticated('DELETE', '/order', { body: { orderID: orderId } });
  }

  private async fetchPaginated(path: string, limit = Number.POSITIVE_INFINITY): Promise<unknown[]> {
    let nextCursor = INITIAL_CURSOR;
    const rows: unknown[] = [];

    while (nextCursor !== END_CURSOR && rows.length < limit) {
      const response = await this.fetchAuthenticated<unknown>('GET', path, {
        query: { next_cursor: nextCursor },
      });
      rows.push(...extractRows(response));

      const next = nextCursorFrom(response);
      if (!next || next === nextCursor) break;
      nextCursor = next;
    }

    return rows;
  }

  private requireCredentials(): Required<Pick<PolymarketClobCredentials, 'address' | 'signerAddress' | 'apiKey' | 'apiSecret' | 'apiPassphrase'>> {
    const { address, apiKey, apiSecret, apiPassphrase } = this.credentials;
    const signerAddress = this.credentials.signerAddress ?? address;
    if (!address || !signerAddress || !apiKey || !apiSecret || !apiPassphrase) {
      throw new Error('Polymarket L2 credentials require POLYMARKET_ADDRESS, POLYMARKET_SIGNER_ADDRESS, POLYMARKET_API_KEY, POLYMARKET_API_SECRET, and POLYMARKET_API_PASSPHRASE');
    }
    return { address, signerAddress, apiKey, apiSecret, apiPassphrase };
  }

  private createAuthHeaders(
    method: string,
    path: string,
    bodyText: string | undefined,
    credentials: Required<Pick<PolymarketClobCredentials, 'address' | 'signerAddress' | 'apiKey' | 'apiSecret' | 'apiPassphrase'>>,
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${timestamp}${method.toUpperCase()}${path}${bodyText ?? ''}`;
    const signature = crypto
      .createHmac('sha256', decodeBase64Url(credentials.apiSecret))
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return {
      POLY_ADDRESS: credentials.signerAddress,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_API_KEY: credentials.apiKey,
      POLY_PASSPHRASE: credentials.apiPassphrase,
    };
  }

  private mapOrder(row: Record<string, unknown>): PolymarketOpenOrder {
    const originalSize = numberFrom(row.original_size ?? row.originalSize ?? row.size);
    const sizeMatched = numberFrom(row.size_matched ?? row.sizeMatched ?? row.matched);
    return {
      id: stringFrom(row.id ?? row.order_id ?? row.orderId),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      assetId: optionalString(row.asset_id ?? row.assetId ?? row.tokenId),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side),
      price: numberFrom(row.price),
      originalSize,
      sizeMatched,
      remainingSize: numberFrom(row.remaining_size ?? row.remainingSize) || Math.max(0, originalSize - sizeMatched),
      status: optionalString(row.status),
      createdAt: optionalString(row.created_at ?? row.createdAt),
      expiration: optionalString(row.expiration),
    };
  }

  private mapTrade(row: Record<string, unknown>): PolymarketUserTrade {
    const price = numberFrom(row.price);
    const size = numberFrom(row.size ?? row.amount);
    return {
      id: stringFrom(row.id ?? row.trade_id ?? row.tradeId ?? row.transactionHash),
      marketId: optionalString(row.market ?? row.marketId ?? row.conditionId),
      assetId: optionalString(row.asset_id ?? row.assetId ?? row.tokenId),
      outcome: optionalString(row.outcome ?? row.outcomeTitle),
      side: normalizeSide(row.side ?? row.type),
      price,
      size,
      value: numberFrom(row.value ?? row.usdcValue) || price * size,
      fee: optionalNumber(row.fee),
      status: optionalString(row.status),
      timestamp: stringFrom(row.timestamp ?? row.match_time ?? row.created_at ?? row.createdAt),
      txHash: optionalString(row.transaction_hash ?? row.transactionHash ?? row.txHash),
    };
  }
}

function readCredentialsFromEnv(): PolymarketClobCredentials {
  const address = envValue(process.env.POLYMARKET_ADDRESS)
    ?? envValue(process.env.POLYMARKET_FUNDER)
    ?? envValue(process.env.POLY_ADDRESS);

  return {
    address,
    signerAddress: envValue(process.env.POLYMARKET_SIGNER_ADDRESS) ?? address,
    apiKey: envValue(process.env.POLYMARKET_API_KEY) ?? envValue(process.env.POLY_API_KEY),
    apiSecret: envValue(process.env.POLYMARKET_API_SECRET) ?? envValue(process.env.POLY_API_SECRET),
    apiPassphrase: envValue(process.env.POLYMARKET_API_PASSPHRASE) ?? envValue(process.env.POLY_API_PASSPHRASE),
  };
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? process.env.POLYRADER_EXTERNAL_TIMEOUT_MS);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30000, Math.max(250, value));
}

function buildQueryString(query: AuthenticatedRequestOptions['query']): string {
  if (!query) return '';
  if (query instanceof URLSearchParams) return query.toString();

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function extractRows(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (response && typeof response === 'object') {
    const data = (response as Record<string, unknown>).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

function nextCursorFrom(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const row = response as Record<string, unknown>;
  return optionalString(row.next_cursor ?? row.nextCursor);
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
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
