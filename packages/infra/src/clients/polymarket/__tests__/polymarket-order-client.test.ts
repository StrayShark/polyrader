import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const createAndPostOrder = vi.fn();

vi.mock('@polymarket/clob-client', () => ({
  ClobClient: vi.fn().mockImplementation(() => ({
    createAndPostOrder,
  })),
  OrderType: { GTC: 'GTC' },
  Side: { BUY: 'BUY', SELL: 'SELL' },
}));

vi.mock('viem', () => ({
  createWalletClient: vi.fn(() => ({})),
  http: vi.fn(),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0xabc' })),
}));

vi.mock('viem/chains', () => ({
  polygon: { id: 137 },
}));

import { PolymarketOrderClient } from '../polymarket-order-client';

describe('PolymarketOrderClient', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envBackup };
    delete process.env.POLYMARKET_PRIVATE_KEY;
    delete process.env.POLYMARKET_ADDRESS;
    delete process.env.POLYMARKET_API_KEY;
    delete process.env.POLYMARKET_API_SECRET;
    delete process.env.POLYMARKET_API_PASSPHRASE;
    process.env.POLYMARKET_LIVE_TRADING_ENABLED = 'true';
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('canPlaceOrders is false without credentials', () => {
    const client = new PolymarketOrderClient();
    expect(client.canPlaceOrders()).toBe(false);
    expect(client.getInitError()).toContain('POLYMARKET_PRIVATE_KEY');
  });

  it('canPlaceOrders is false when live trading disabled', () => {
    process.env.POLYMARKET_PRIVATE_KEY = '0x' + '1'.repeat(64);
    process.env.POLYMARKET_ADDRESS = '0xabc';
    process.env.POLYMARKET_API_KEY = 'key';
    process.env.POLYMARKET_API_SECRET = 'secret';
    process.env.POLYMARKET_API_PASSPHRASE = 'pass';
    process.env.POLYMARKET_LIVE_TRADING_ENABLED = 'false';

    const client = new PolymarketOrderClient();
    expect(client.canPlaceOrders()).toBe(false);
  });

  it('createAndPostLimitOrder posts via ClobClient when configured', async () => {
    process.env.POLYMARKET_PRIVATE_KEY = '0x' + '1'.repeat(64);
    process.env.POLYMARKET_ADDRESS = '0xabc';
    process.env.POLYMARKET_API_KEY = 'key';
    process.env.POLYMARKET_API_SECRET = 'secret';
    process.env.POLYMARKET_API_PASSPHRASE = 'pass';
    createAndPostOrder.mockResolvedValue({ orderID: 'ord-1', status: 'live' });

    const client = new PolymarketOrderClient();
    expect(client.canPlaceOrders()).toBe(true);

    const result = await client.createAndPostLimitOrder({
      tokenId: 'token1',
      price: 0.6,
      size: 10,
      side: 'buy',
    });

    expect(createAndPostOrder).toHaveBeenCalled();
    expect(result.orderId).toBe('ord-1');
    expect(result.status).toBe('live');
  });
});
