import type { Request, Response } from 'express';
import { MarketOrderService } from '../services/market-order-service';
import { logger } from '../utils/logger';
import type { placeMarketOrderBodySchema } from '../validation/schemas';
import type { z } from 'zod';

type PlaceMarketOrderBody = z.infer<typeof placeMarketOrderBodySchema>;

export class MarketOrderController {
  private service = new MarketOrderService();

  getTradingStatus(_req: Request, res: Response): void {
    try {
      res.json({ data: this.service.getTradingStatus() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get trading status' });
    }
  }

  async placeOrder(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as PlaceMarketOrderBody;
      const result = await this.service.placeOrder(body);
      res.status(201).json({ data: result });
    } catch (err) {
      const message = (err as Error).message;
      logger.warn('Failed to place market order', { error: message });
      res.status(400).json({ error: message });
    }
  }

  async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderId = String(req.params.orderId ?? '');
      await this.service.cancelOrder(orderId);
      res.json({ data: { orderId, cancelled: true } });
    } catch (err) {
      const message = (err as Error).message;
      logger.warn('Failed to cancel market order', { error: message });
      res.status(400).json({ error: message });
    }
  }
}
