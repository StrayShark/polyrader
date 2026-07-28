import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolymarketDataClient } from '../data-client';

describe('PolymarketDataClient public smart-wallet data', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps global large trades with cash value and an ISO timestamp', async () => {
    mockJson([
      {
        proxyWallet: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        side: 'BUY',
        asset: 'token-1',
        conditionId: 'condition-1',
        size: 1000,
        price: 0.62,
        timestamp: 1_784_534_000,
        title: 'Test market',
        outcome: 'Yes',
        transactionHash: '0xtrade-1',
        name: 'Leader',
      },
    ]);

    const client = new PolymarketDataClient('https://data.test');
    const trades = await client.getPublicTrades(50, 500);

    expect(trades).toEqual([
      expect.objectContaining({
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        txHash: '0xtrade-1',
        tokenId: 'token-1',
        value: 620,
        side: 'buy',
        timestamp: '2026-07-20T07:53:20.000Z',
      }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('filterType=CASH');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('filterAmount=500');
  });

  it('maps leaderboard and realized closed-position performance fields', async () => {
    mockJson([
      { rank: '1', proxyWallet: '0xleader', userName: 'Leader', vol: 10000, pnl: 2500 },
    ]);
    mockJson([
      {
        proxyWallet: '0xleader',
        conditionId: 'condition-1',
        asset: 'token-1',
        avgPrice: 0.4,
        totalBought: 100,
        realizedPnl: 60,
        curPrice: 1,
        title: 'Resolved market',
        outcome: 'Yes',
      },
    ]);

    const client = new PolymarketDataClient('https://data.test');
    const leaders = await client.getLeaderboard({ limit: 1 });
    const positions = await client.getClosedPositions('0xleader', 10);

    expect(leaders[0]).toEqual(expect.objectContaining({ address: '0xleader', volume: 10000, pnl: 2500 }));
    expect(positions[0]).toEqual(expect.objectContaining({
      cashPnl: 60,
      initialValue: 40,
      currentPrice: 1,
    }));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('sortBy=TIMESTAMP');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('sortDirection=DESC');
  });

  it('maps user trades with the market question for wallet detail views', async () => {
    mockJson([
      {
        id: 'trade-1',
        conditionId: 'condition-1',
        asset: 'token-1',
        title: 'CS2: Spirit vs G2 - Match Winner',
        outcome: 'Spirit',
        side: 'BUY',
        price: 0.85,
        size: 642.35,
        value: 546,
        timestamp: 1_785_040_000,
        transactionHash: '0xtrade-1',
      },
    ]);

    const client = new PolymarketDataClient('https://data.test');
    const trades = await client.getTrades('0xleader', 20);

    expect(trades[0]).toEqual(expect.objectContaining({
      question: 'CS2: Spirit vs G2 - Match Winner',
      outcome: 'Spirit',
      side: 'buy',
      value: 546,
      txHash: '0xtrade-1',
    }));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/trades');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('user=0xleader');
  });

  function mockJson(value: unknown): void {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
});
