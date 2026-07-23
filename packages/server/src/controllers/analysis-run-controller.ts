import type { Request, Response } from 'express';
import { AnalysisRunService } from '../services/analysis-run-service';
import {
  AnalysisEligibilityError,
  StandardAnalysisService,
} from '../services/standard-analysis-service';

export class AnalysisRunController {
  private service = new AnalysisRunService();
  private standard = new StandardAnalysisService();

  list(req: Request, res: Response): void {
    try {
      const limit = Number(req.query.limit ?? 50);
      const game = typeof req.query.game === 'string' ? req.query.game : undefined;
      const data = this.service.listRuns(Number.isFinite(limit) ? limit : 50, game);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  get(req: Request, res: Response): void {
    try {
      const runId = String(req.params.runId ?? '');
      const detail = this.service.getDetail(runId);
      if (!detail) {
        res.status(404).json({ error: `Analysis run ${runId} not found` });
        return;
      }
      res.json({ data: detail });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  create(req: Request, res: Response): void {
    try {
      const detail = this.service.createRun({
        envelope: req.body.envelope as import('@polyrader/core').AnalysisRequestEnvelope,
        provider: req.body.provider,
        model: req.body.model,
        gameAdapterVersion: req.body.gameAdapterVersion,
        marketAdapterVersion: req.body.marketAdapterVersion,
      });
      res.status(201).json({ data: detail });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  ingest(req: Request, res: Response): void {
    try {
      const runId = String(req.params.runId ?? '');
      const detail = this.service.ingestResponse({
        runId,
        rawResponse: String(req.body.rawResponse ?? ''),
        attempt: req.body.attempt,
        latencyMs: req.body.latencyMs,
        promptTokens: req.body.promptTokens,
        completionTokens: req.body.completionTokens,
        totalTokens: req.body.totalTokens,
        policy: req.body.policy,
        settlementRulesAvailable: req.body.settlementRulesAvailable,
        bankroll: req.body.bankroll,
      });
      res.json({ data: detail });
    } catch (err) {
      const message = (err as Error).message;
      res.status(message.includes('not found') ? 404 : 400).json({ error: message });
    }
  }

  async execute(req: Request, res: Response): Promise<void> {
    try {
      const detail = await this.standard.execute({
        game: req.body.game,
        matchId: req.body.matchId,
        provider: req.body.provider,
        locale: req.body.locale,
        market: req.body.market,
      });
      res.status(201).json({ data: detail });
    } catch (err) {
      if (err instanceof AnalysisEligibilityError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
          eligibility: err.eligibility,
        });
        return;
      }
      const message = (err as Error).message;
      const unavailable = message.includes('not configured') || message.includes('No executable');
      res.status(unavailable ? 409 : 400).json({ error: message });
    }
  }

  /** Deterministic four-game prompt → validated response → paper decision. */
  runFixture(req: Request, res: Response): void {
    try {
      const invalid = req.body?.invalid === true || req.query.invalid === '1';
      const detail = this.service.runFixturePipeline({
        game: ['cs2', 'lol', 'dota2', 'valorant'].includes(req.body?.game) ? req.body.game : 'cs2',
        invalid,
        provider: typeof req.body?.provider === 'string' ? req.body.provider : undefined,
        model: typeof req.body?.model === 'string' ? req.body.model : undefined,
        nonce: Math.random().toString(36).slice(2, 8),
        now: new Date(),
      });
      res.status(201).json({ data: detail });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
