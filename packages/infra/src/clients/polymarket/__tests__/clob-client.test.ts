import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolymarketClobClient } from '../clob-client';

const credentials = {
  address: '0xfunder',
  signerAddress: '0xsigner',
  apiKey: 'key',
  apiSecret: Buffer.from('secret').toString('base64'),
  apiPassphrase: 'pass',
};

describe('PolymarketClobClient', () => {
  const envBackup = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...envBackup };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = envBackup;
  });

  it('signs balance allowance against the endpoint path while sending query params', async () => {
    process.env.POLYMARKET_SIGNATURE_TYPE = '2';
    mockJson({ balance: '12.34', allowance: '56.78' });

    const client = new PolymarketClobClient('https://clob.test', credentials);
    const balance = await client.getBalanceAllowance();

    expect(balance.balance).toBe(12.34);
    expect(balance.allowance).toBe(56.78);
    expect(requestUrl(0)).toBe('https://clob.test/balance-allowance?asset_type=COLLATERAL&signature_type=2');
    expect(requestHeaders(0).POLY_ADDRESS).toBe('0xsigner');
    expect(requestHeaders(0).POLY_SIGNATURE).toBe(expectedSignature('GET', '/balance-allowance'));
  });

  it('reads open orders from the authenticated data endpoint', async () => {
    mockJson({
      data: [
        {
          id: 'order-1',
          market: 'market-1',
          asset_id: 'token-1',
          side: 'BUY',
          price: '0.42',
          original_size: '10',
          size_matched: '2',
          outcome: 'Yes',
        },
      ],
      next_cursor: 'LTE=',
    });

    const client = new PolymarketClobClient('https://clob.test', credentials);
    const orders = await client.getOpenOrders();

    expect(orders).toEqual([
      expect.objectContaining({
        id: 'order-1',
        marketId: 'market-1',
        assetId: 'token-1',
        side: 'buy',
        price: 0.42,
        originalSize: 10,
        sizeMatched: 2,
        remainingSize: 8,
      }),
    ]);
    expect(requestUrl(0)).toBe('https://clob.test/data/orders?next_cursor=MA%3D%3D');
    expect(requestHeaders(0).POLY_SIGNATURE).toBe(expectedSignature('GET', '/data/orders'));
  });

  it('reads private trades from paginated data responses', async () => {
    mockJson({
      data: [
        {
          id: 'trade-1',
          market: 'market-1',
          asset_id: 'token-1',
          side: 'SELL',
          price: '0.6',
          size: '5',
          status: 'matched',
          match_time: '2026-07-05T00:00:00Z',
        },
      ],
      next_cursor: 'next-page',
    });
    mockJson({
      data: [
        {
          id: 'trade-2',
          market: 'market-2',
          asset_id: 'token-2',
          side: 'BUY',
          price: '0.2',
          size: '10',
          status: 'matched',
          match_time: '2026-07-06T00:00:00Z',
        },
      ],
      next_cursor: 'LTE=',
    });

    const client = new PolymarketClobClient('https://clob.test', credentials);
    const trades = await client.getAuthenticatedTrades(2);

    expect(trades.map((trade) => trade.id)).toEqual(['trade-1', 'trade-2']);
    expect(trades[0]).toEqual(expect.objectContaining({ side: 'sell', value: 3 }));
    expect(requestUrl(0)).toBe('https://clob.test/data/trades?next_cursor=MA%3D%3D');
    expect(requestUrl(1)).toBe('https://clob.test/data/trades?next_cursor=next-page');
  });

  function mockJson(value: unknown): void {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  function requestUrl(index: number): string {
    return String(fetchMock.mock.calls[index]?.[0]);
  }

  function requestHeaders(index: number): Record<string, string> {
    const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
    return init?.headers as Record<string, string>;
  }

  function expectedSignature(method: string, path: string): string {
    return crypto
      .createHmac('sha256', Buffer.from('secret'))
      .update(`1783296000${method}${path}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
});
