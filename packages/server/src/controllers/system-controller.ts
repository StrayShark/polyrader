import type { Request, Response } from 'express';
import { taskTracker } from '../services/task-tracker-service';
import { logger } from '../utils/logger';
import { checkHealth } from '../health';

export interface SystemFeatures {
  marketOrdersEnabled: boolean;
  liveTradingEnabled: boolean;
  polymarketAccountEnabled: boolean;
}

export class SystemController {
  getTasks(_req: Request, res: Response): void {
    try {
      res.json({ data: taskTracker.getSnapshot() });
    } catch (err) {
      logger.error('Failed to fetch task snapshot', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }

  getFeatures(_req: Request, res: Response): void {
    const marketOrdersEnabled = process.env.CS2_SIMBOOK_ENABLE_MARKET_ORDERS === 'true';
    const liveTradingEnabled = process.env.POLYMARKET_LIVE_TRADING_ENABLED === 'true';
    const polymarketAccountEnabled =
      process.env.CS2_SIMBOOK_ENABLE_POLYMARKET_ACCOUNT === 'true' ||
      process.env.POLYMARKET_ACCOUNT_ENABLED === 'true';

    const features: SystemFeatures = {
      marketOrdersEnabled,
      liveTradingEnabled,
      polymarketAccountEnabled,
    };

    res.json({ data: features });
  }

  async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const health = await checkHealth();
      res.json({ data: health });
    } catch (err) {
      logger.error('Failed to fetch system health', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch system health' });
    }
  }
}
