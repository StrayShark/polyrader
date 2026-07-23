import type { Request, Response } from 'express';
import type {
  EsportsGame,
  EsportsSourceEntityType,
  EsportsTeamAliasStatus,
} from '@polyrader/core';
import { EsportsSourceService } from '../services/esports-source-service';
import { logger } from '../utils/logger';
import { Dota2MatchReconciliationService } from '../services/dota2-match-reconciliation-service';
import { GridMatchReconciliationService } from '../services/grid-match-reconciliation-service';

export class EsportsSourceController {
  private readonly service = new EsportsSourceService();
  private readonly dota2Settlement = new Dota2MatchReconciliationService();
  private readonly gridSettlement = new GridMatchReconciliationService();

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

  listMatchIdentities(req: Request, res: Response): void {
    try {
      const data = this.service.listMatchIdentities(req.params.game as EsportsGame, {
        canonicalMatchId: req.query.canonicalMatchId
          ? String(req.query.canonicalMatchId)
          : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ data });
    } catch (err) {
      logger.error('Failed to list esports match identities', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load esports match identities' });
    }
  }

  listTeamAliases(req: Request, res: Response): void {
    try {
      const data = this.service.listTeamAliases(req.params.game as EsportsGame, {
        status: req.query.status as EsportsTeamAliasStatus | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ data });
    } catch (err) {
      logger.error('Failed to list esports team aliases', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to load esports team aliases' });
    }
  }

  reviewTeamAlias(req: Request, res: Response): void {
    try {
      const data = this.service.reviewTeamAlias({
        game: req.params.game as EsportsGame,
        source: req.body.source,
        sourceTeamId: req.body.sourceTeamId,
        alias: req.body.alias,
        targetSource: req.body.targetSource,
        targetTeamId: req.body.targetTeamId,
        status: req.body.status,
        evidence: req.body.evidence,
      });
      res.json({ data });
    } catch (err) {
      logger.error('Failed to review esports team alias', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to review esports team alias' });
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

  async reconcileDota2Match(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.dota2Settlement.reconcileMatch(String(req.params.matchId));
      const status = data.status === 'unavailable' ? 502 : 200;
      res.status(status).json({ data });
    } catch (err) {
      logger.error('Dota 2 match reconciliation failed', {
        matchId: req.params.matchId,
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Dota 2 match reconciliation failed' });
    }
  }

  async reconcileGameMatch(req: Request, res: Response): Promise<void> {
    const game = req.params.game as 'lol' | 'dota2' | 'valorant';
    const matchId = String(req.params.matchId);
    try {
      const data =
        game === 'dota2'
          ? await this.dota2Settlement.reconcileMatch(matchId)
          : await this.gridSettlement.reconcileMatch(game, matchId);
      res.status(data.status === 'unavailable' ? 502 : 200).json({ data });
    } catch (err) {
      logger.error('Game match reconciliation failed', {
        game,
        matchId,
        error: (err as Error).message,
      });
      res.status(500).json({ error: 'Game match reconciliation failed' });
    }
  }
}
