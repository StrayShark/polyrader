import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  canPlaceOrders: vi.fn(),
  getInitError: vi.fn(),
  createAndPostLimitOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getBalanceAllowance: vi.fn(),
  findBySlug: vi.fn(),
  getMidpoint: vi.fn(),
}));

vi.mock('@polyrader/infra', () => ({
  PolymarketOrderClient: vi.fn().mockImplementation(() => ({
    canPlaceOrders: mocks.canPlaceOrders,
    getInitError: mocks.getInitError,
    createAndPostLimitOrder: mocks.createAndPostLimitOrder,
  })),
  PolymarketClobClient: vi.fn().mockImplementation(() => ({
    getMidpoint: mocks.getMidpoint,
    getBalanceAllowance: mocks.getBalanceAllowance,
    cancelOrder: mocks.cancelOrder,
  })),
  MarketRepository: vi.fn().mockImplementation(() => ({
    findBySlug: mocks.findBySlug,
  })),
}));

import { MarketOrderService } from '../services/market-order-service';

describe('MarketOrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canPlaceOrders.mockReturnValue(false);
    mocks.getInitError.mockReturnValue('not configured');
  });

  it('getTradingStatus surfaces init error when not configured', () => {
    const status = new MarketOrderService().getTradingStatus();
    expect(status.canPlaceOrders).toBe(false);
    expect(status.message).toBe('not configured');
  });

  it('placeOrder throws when live trading unavailable', async () => {
    await expect(new MarketOrderService().placeOrder({
      slug: 'spirit-vs-g2-bo3',
      side: 'buy',
      team: 'team_a',
      amountUsd: 10,
    })).rejects.toThrow('not configured');
  });

  it('placeOrder submits limit order when configured', async () => {
    mocks.canPlaceOrders.mockReturnValue(true);
    mocks.getBalanceAllowance.mockResolvedValue({ balance: 100 });
    mocks.findBySlug.mockReturnValue({
      slug: 'spirit-vs-g2-bo3',
      clobTokenIds: ['token-a', 'token-b'],
    });
    mocks.getMidpoint.mockResolvedValue(0.65);
    mocks.createAndPostLimitOrder.mockResolvedValue({
      orderId: 'ord-99',
      status: 'live',
      raw: {},
    });

    const result = await new MarketOrderService().placeOrder({
      slug: 'spirit-vs-g2-bo3',
      side: 'buy',
      team: 'team_a',
      amountUsd: 10,
    });

    expect(result.orderId).toBe('ord-99');
    expect(result.tokenId).toBe('token-a');
    expect(mocks.getBalanceAllowance).toHaveBeenCalled();
    expect(mocks.createAndPostLimitOrder).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: 'token-a', side: 'buy' }),
    );
  });

  it('placeOrder rejects when balance is insufficient', async () => {
    mocks.canPlaceOrders.mockReturnValue(true);
    mocks.getBalanceAllowance.mockResolvedValue({ balance: 5 });
    mocks.findBySlug.mockReturnValue({
      slug: 'spirit-vs-g2-bo3',
      clobTokenIds: ['token-a', 'token-b'],
    });

    await expect(new MarketOrderService().placeOrder({
      slug: 'spirit-vs-g2-bo3',
      side: 'buy',
      team: 'team_a',
      amountUsd: 10,
    })).rejects.toThrow(/Insufficient USDC balance/i);
  });

  it('placeOrder rejects when allowance is insufficient', async () => {
    mocks.canPlaceOrders.mockReturnValue(true);
    mocks.getBalanceAllowance.mockResolvedValue({ balance: 100, allowance: 5 });
    mocks.findBySlug.mockReturnValue({
      slug: 'spirit-vs-g2-bo3',
      clobTokenIds: ['token-a', 'token-b'],
    });

    await expect(new MarketOrderService().placeOrder({
      slug: 'spirit-vs-g2-bo3',
      side: 'buy',
      team: 'team_a',
      amountUsd: 10,
    })).rejects.toThrow(/Insufficient USDC allowance/i);
  });

  it('cancelOrder delegates to CLOB client when configured', async () => {
    mocks.canPlaceOrders.mockReturnValue(true);
    mocks.cancelOrder.mockResolvedValue(undefined);

    await new MarketOrderService().cancelOrder('ord-123');

    expect(mocks.cancelOrder).toHaveBeenCalledWith('ord-123');
  });
});
