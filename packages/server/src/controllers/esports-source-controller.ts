import type { Request, Response } from 'express';
import type { EsportsGame, EsportsSourceEntityType } from '@polyrader/core';
import { EsportsSourceService } from '../services/esports-source-service';
import { logger } from '../utils/logger';

export class EsportsSourceController {
  private readonly service = new EsportsSourceService();

  getCatalog(_req: Request, res: Response): void {
    try {
      res.json({ data: this.service.getCatalog() });
    } catch (err) {
      logger.error('Failed to load esports source catalog', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load esports data sources' });
    }
  }

  async syncGame(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.service.syncGame(req.params.game as EsportsGame);
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to sync esports sources', {
        game: req.params.game,
        error: (err as Error).message,
      });
      res.status(502).json({ error: 'Esports source sync failed' });
    }
  }

  listSnapshots(req: Request, res: Response): void {
    try {
      const data = this.service.listSnapshots(req.params.game as EsportsGame, {
        entityType: req.query.entityType as EsportsSourceEntityType | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ data });
    } catch (err) {
      logger.error('Failed to list esports source snapshots', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load esports source snapshots' });
    }
  }

  async searchTeams(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.searchLiquipediaTeams(
        req.params.game as EsportsGame,
        String(req.query.q),
      );
      res.json({ data });
    } catch (err) {
      logger.warn('Liquipedia multi-game team search failed', {
        game: req.params.game,
        error: (err as Error).message,
      });
      res.status(502).json({ error: 'Liquipedia team search failed' });
    }
  }

  async syncTeamRoster(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.syncLiquipediaRoster(
        req.params.game as EsportsGame,
        String(req.body.title),
      );
      res.json({ data });
    } catch (err) {
      logger.warn('Liquipedia multi-game roster sync failed', {
        game: req.params.game,
        title: req.body.title,
        error: (err as Error).message,
      });
      res.status(502).json({ error: 'Liquipedia roster sync failed' });
    }
  }
}
