import type { Request, Response } from 'express';
import type { EsportsGame } from '@polyrader/core';
import { FactNormalizationService } from '../services/fact-normalization-service';

const GAMES = new Set(['cs2', 'lol', 'dota2', 'valorant']);

export class ValidationLabController {
  private service = new FactNormalizationService();

  listBoards(_req: Request, res: Response): void {
    try {
      res.json({ data: this.service.listBoards() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getBoard(req: Request, res: Response): void {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      const result = this.service.getBoard(game);
      res.json({ data: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  normalize(req: Request, res: Response): void {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      const result = this.service.normalizeGame(game, {
        useFixtureFallback: req.body?.fixture === true && process.env.NODE_ENV !== 'production',
      });
      res.status(201).json({ data: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  listFacts(req: Request, res: Response): void {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      const limit = Number(req.query.limit ?? 20);
      res.json({ data: this.service.listFacts(game, Number.isFinite(limit) ? limit : 20) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
