import { PolymarketClobClient, PolymarketOrderClient, MarketRepository } from '@polyrader/infra';
import { logger } from '../utils/logger';

export interface PlaceMarketOrderInput {
  slug: string;
  side: 'buy' | 'sell';
  team: 'team_a' | 'team_b';
  amountUsd: number;
  price?: number;
}

export interface PlaceMarketOrderResult {
  mode: 'live';
  orderId?: string;
  status?: string;
  tokenId: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

export class MarketOrderService {
  private marketRepo = new MarketRepository();
  private clobClient = new PolymarketClobClient();
  private orderClient = new PolymarketOrderClient();

  getTradingStatus(): {
    liveEnabled: boolean;
    canPlaceOrders: boolean;
    message?: string;
  } {
    const canPlaceOrders = this.orderClient.canPlaceOrders();
    return {
      liveEnabled: process.env.POLYMARKET_LIVE_TRADING_ENABLED !== 'false',
      canPlaceOrders,
      message: canPlaceOrders ? undefined : this.orderClient.getInitError(),
    };
  }

  async placeOrder(input: PlaceMarketOrderInput): Promise<PlaceMarketOrderResult> {
    if (!this.orderClient.canPlaceOrders()) {
      throw new Error(this.orderClient.getInitError() ?? 'Live trading is not enabled');
    }

    await this.assertSufficientBalance(input.amountUsd);

    const market = this.marketRepo.findBySlug(input.slug);
    if (!market) {
      throw new Error('Market not found');
    }

    const tokenIndex = input.team === 'team_a' ? 0 : 1;
    const tokenId = market.clobTokenIds?.[tokenIndex];
    if (!tokenId) {
      throw new Error('Market token id unavailable');
    }

    const price = input.price ?? await this.clobClient.getMidpoint(tokenId);
    if (!Number.isFinite(price) || price <= 0 || price >= 1) {
      throw new Error('Invalid market price for order');
    }

    const size = Math.max(1, Math.floor(input.amountUsd / price));
    const result = await this.orderClient.createAndPostLimitOrder({
      tokenId,
      price,
      size,
      side: input.side,
    });

    logger.info('[MarketOrder] Live order submitted', {
      slug: input.slug,
      tokenId,
      price,
      size,
      orderId: result.orderId,
    });

    return {
      mode: 'live',
      orderId: result.orderId,
      status: result.status,
      tokenId,
      price,
      size,
      side: input.side,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!this.orderClient.canPlaceOrders()) {
      throw new Error(this.orderClient.getInitError() ?? 'Live trading is not enabled');
    }
    await this.clobClient.cancelOrder(orderId);
    logger.info('[MarketOrder] Live order cancelled', { orderId });
  }

  private async assertSufficientBalance(amountUsd: number): Promise<void> {
    try {
      const balance = await this.clobClient.getBalanceAllowance();
      const available = balance.balance ?? 0;
      if (available < amountUsd) {
        throw new Error(
          `Insufficient USDC balance ($${available.toFixed(2)} available, $${amountUsd.toFixed(2)} required)`,
        );
      }
      const allowance = balance.allowance;
      if (allowance !== undefined && allowance < amountUsd) {
        throw new Error(
          `Insufficient USDC allowance ($${allowance.toFixed(2)} approved, $${amountUsd.toFixed(2)} required)`,
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('credentials') || message.includes('not configured')) {
        return;
      }
      throw err;
    }
  }
}
