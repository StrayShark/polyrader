import type { Request, Response } from 'express';
import { WhaleService } from '../services/whale-service';
import { WalletPerformanceService } from '../services/wallet-performance-service';
import { sharedWhaleIngestion } from '../services/whale-ingestion-service';
import { sharedSmartWalletDiscovery } from '../services/smart-wallet-discovery-service';
import { broadcast } from '../websocket';
import { cacheDelete, cacheKeys } from '@polyrader/infra';
import { logger } from '../utils/logger';
import type { whaleLeaderboardQuerySchema, whaleQuerySchema } from '../validation/schemas';
import type { z } from 'zod';

type WhaleQuery = z.infer<typeof whaleQuerySchema>;
type WhaleLeaderboardQuery = z.infer<typeof whaleLeaderboardQuerySchema>;

export class WhaleController {
  private service = new WhaleService();
  private performanceService = new WalletPerformanceService();

  async getWhales(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WhaleQuery;
      const whales = await this.service.getWhales({
        limit: query.limit,
        sort: query.sort,
        minSamples: query.minSamples,
        minWinRate: query.minWinRate,
        minRoi: query.minRoi,
      });
      res.json({ data: whales });
    } catch (err) {
      logger.error('Failed to fetch whales', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whales', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query as unknown as WhaleLeaderboardQuery;
      const whales = this.performanceService.getLeaderboard({
        limit: query.limit,
        minSamples: query.minSamples,
        minWinRate: query.minWinRate,
        minRoi: query.minRoi,
      });
      res.json({ data: whales });
    } catch (err) {
      logger.error('Failed to fetch whale leaderboard', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whale leaderboard', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async refresh(_req: Request, res: Response): Promise<void> {
    try {
      const ingestedTrades = await sharedWhaleIngestion.scanRecentTrades();
      let discovery = { discovered: 0, qualified: 0, failedProfiles: 0 };
      let discoveryError: string | null = null;
      try {
        discovery = await sharedSmartWalletDiscovery.discoverTopWallets(12);
      } catch (err) {
        discoveryError = (err as Error).message;
        logger.warn('Smart wallet discovery failed during refresh', { error: discoveryError });
      }
      const performance = await this.performanceService.recalculateAll();
      const cacheKeysToDelete = await cacheKeys('whale*');
      await Promise.all(cacheKeysToDelete.map((key) => cacheDelete(key)));
      broadcast('whales', { newTrades: ingestedTrades, discovered: discovery.discovered });
      res.json({
        data: {
          ingestedTrades,
          ...discovery,
          performanceUpdated: performance.addressesUpdated,
          discoveryError,
          ingestion: sharedWhaleIngestion.getStatus(),
        },
      });
    } catch (err) {
      logger.error('Failed to refresh smart wallets', { error: (err as Error).message });
      res.status(502).json({ error: 'Failed to refresh smart-wallet data', message: (err as Error).message });
    }
  }

  async getWhale(req: Request, res: Response): Promise<void> {
    try {
      const whale = await this.service.getWhaleDetail(req.params.address);
      if (!whale) {
        res.status(404).json({ error: 'Whale not found' });
        return;
      }
      res.json({ data: whale });
    } catch (err) {
      logger.error('Failed to fetch whale', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch whale', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getAddressGraph(req: Request, res: Response): Promise<void> {
    try {
      const graph = await this.service.getAddressGraph();
      res.json({ data: graph });
    } catch (err) {
      logger.error('Failed to fetch whale address graph', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch address graph', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
