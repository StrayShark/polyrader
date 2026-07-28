import type { Request, Response } from 'express';
import type { EsportsGame } from '@polyrader/core';
import { P5VerificationService } from '../services/p5-verification-service';
import { FactNormalizationService } from '../services/fact-normalization-service';
import { EsportsSourceService } from '../services/esports-source-service';
import { ReleaseGateService } from '../services/release-gate-service';
import { CurrentSourceReleaseAuditService, annotateBoardMarketDiscovery } from '../services/current-source-release-audit-service';
import { ReleaseDiagnosticsService } from '../services/release-diagnostics-service';
import { ReleaseLifecycleService } from '../services/release-lifecycle-service';
import { Dota2MarketDiscoveryService } from '../services/dota2-market-discovery-service';
import { Cs2MarketDiscoveryService } from '../services/cs2-market-discovery-service';
import {
  LolMarketDiscoveryService,
  ValorantMarketDiscoveryService,
} from '../services/riot-games-market-discovery-service';
import { envNumber, withTimeout } from '../utils/timeout';

const GAME_LIST = ['cs2', 'lol', 'dota2', 'valorant'] as const;
const GAMES = new Set<string>(GAME_LIST);
const CURRENT_SOURCE_SMOKE_BOARD_TIMEOUT_MS = 30_000;

interface CurrentSourceSmokeBoard {
  game: EsportsGame;
  status: 'verified' | 'blocked' | 'failed';
  boardState?: string;
  completeness?: number;
  analysis?: string;
  gate: string;
  blocker?: string | null;
  auditId?: string;
}

interface CurrentSourceSmokeReport {
  generatedAt: string;
  executeAnalysis: boolean;
  verifiedCount: number;
  total: number;
  releaseReady: boolean;
  boards: CurrentSourceSmokeBoard[];
}

export class ValidationLabController {
  private service = new FactNormalizationService();
  private sources = new EsportsSourceService();
  private releaseGates = new ReleaseGateService();
  private releaseAudit = new CurrentSourceReleaseAuditService();
  private diagnostics = new ReleaseDiagnosticsService();
  private lifecycle = new ReleaseLifecycleService();
  private dotaMarkets = new Dota2MarketDiscoveryService();
  private cs2Markets = new Cs2MarketDiscoveryService();
  private lolMarkets = new LolMarketDiscoveryService();
  private valorantMarkets = new ValorantMarketDiscoveryService();

  verifyP5(req: Request, res: Response): void {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        error: 'P5 verification is only available outside production',
      });
      return;
    }
    try {
      const report = new P5VerificationService().verifyAll({
        nonce: typeof req.body?.nonce === 'string' ? req.body.nonce : undefined,
      });
      res.status(201).json({ data: report });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  listReleaseGates(_req: Request, res: Response): void {
    try {
      res.json({ data: this.releaseGates.list() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getReleaseReport(_req: Request, res: Response): void {
    try {
      res.json({ data: this.releaseGates.report() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getReleaseGate(req: Request, res: Response): void {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      res.json({ data: this.releaseGates.get(game) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  async runReleaseAudit(req: Request, res: Response): Promise<void> {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      const result = await this.releaseAudit.run(game, {
        executeAnalysis: req.body?.executeAnalysis !== false,
        provider: typeof req.body?.provider === 'string' ? req.body.provider : undefined,
        preferredExternalMatchId:
          typeof req.body?.preferredExternalMatchId === 'string'
            ? req.body.preferredExternalMatchId
            : undefined,
      });
      res.status(201).json({ data: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  async runCurrentSourceSmoke(req: Request, res: Response): Promise<void> {
    const executeAnalysis = req.body?.executeAnalysis === true;
    const boardTimeoutMs = envNumber(
      'POLYRADER_CURRENT_SOURCE_SMOKE_BOARD_TIMEOUT_MS',
      CURRENT_SOURCE_SMOKE_BOARD_TIMEOUT_MS,
      1_000,
      180_000,
    );
    const preferredMatchIds =
      req.body?.preferredMatchIds && typeof req.body.preferredMatchIds === 'object'
        ? (req.body.preferredMatchIds as Record<string, unknown>)
        : {};
    const boards: CurrentSourceSmokeBoard[] = [];

    for (const game of GAME_LIST) {
      try {
        const preferredExternalMatchId =
          typeof preferredMatchIds[game] === 'string'
            ? String(preferredMatchIds[game])
            : undefined;
        const result = await withTimeout(
          this.releaseAudit.run(game, {
            executeAnalysis,
            preferredExternalMatchId,
          }),
          boardTimeoutMs,
          `current-source smoke ${game}`,
        );
        const blockers = result.gate.currentSource.blockers;
        boards.push({
          game,
          status: result.gate.status === 'verified' ? 'verified' : 'blocked',
          boardState: result.board.boardState,
          completeness: result.board.completeness,
          analysis: result.analysis.status,
          gate: result.gate.status,
          blocker:
            blockers[0] ??
            result.analysis.detail ??
            result.board.stages.find((stage) => stage.status !== 'passed')?.detail ??
            null,
          auditId: result.auditId,
        });
      } catch (err) {
        boards.push({
          game,
          status: 'failed',
          analysis: 'failed',
          gate: 'failed',
          blocker: (err as Error).message,
        });
      }
    }

    const verifiedCount = boards.filter((item) => item.status === 'verified').length;
    const report: CurrentSourceSmokeReport = {
      generatedAt: new Date().toISOString(),
      executeAnalysis,
      verifiedCount,
      total: GAME_LIST.length,
      releaseReady: verifiedCount === GAME_LIST.length,
      boards,
    };
    res.status(201).json({ data: report });
  }

  listReleaseAudits(req: Request, res: Response): void {
    try {
      const requestedGame = typeof req.query.game === 'string' ? req.query.game : undefined;
      if (requestedGame && !GAMES.has(requestedGame)) {
        res.status(400).json({ error: `Unsupported game ${requestedGame}` });
        return;
      }
      const requestedLimit = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(200, Math.max(1, Math.trunc(requestedLimit)))
        : 50;
      res.json({
        data: this.diagnostics.list(requestedGame as EsportsGame | undefined, limit),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getReleaseAudit(req: Request, res: Response): void {
    try {
      const audit = this.diagnostics.get(String(req.params.auditId ?? ''));
      if (!audit) {
        res.status(404).json({ error: 'Release audit not found' });
        return;
      }
      res.json({ data: audit });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  exportDiagnostics(req: Request, res: Response): void {
    try {
      const requestedLimit = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(200, Math.max(1, Math.trunc(requestedLimit)))
        : 50;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="polyrader-release-diagnostics-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      res.json({ data: this.diagnostics.export(limit) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getLifecycle(req: Request, res: Response): void {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      res.json({ data: this.lifecycle.get(game) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

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

  async normalize(req: Request, res: Response): Promise<void> {
    try {
      const game = String(req.params.game ?? '') as EsportsGame;
      if (!GAMES.has(game)) {
        res.status(400).json({ error: `Unsupported game ${game}` });
        return;
      }
      const forceFixture = req.body?.fixture === true && process.env.NODE_ENV !== 'production';
      const refreshSources =
        !forceFixture &&
        (req.body?.refreshSources === true || req.body?.discoverMarkets === true);
      let sourceRefresh:
        | { attempted: true; status: string; records: number }
        | { attempted: false }
        | undefined;
      if (refreshSources) {
        try {
          const sync = await this.sources.syncGame(game);
          sourceRefresh = {
            attempted: true,
            status: sync.status,
            records: sync.records,
          };
        } catch {
          sourceRefresh = { attempted: true, status: 'failed', records: 0 };
        }
      } else {
        sourceRefresh = { attempted: false };
      }
      let result = this.service.normalizeGame(game, {
        forceFixture,
        preferredExternalMatchId:
          typeof req.body?.preferredExternalMatchId === 'string'
            ? req.body.preferredExternalMatchId
            : undefined,
      });
      let marketDiscovery:
        | { scanned: number; aligned: number; marketIds: string[]; detail: string; matchedExternalMatchId?: string }
        | undefined;
      if (game === 'dota2' && req.body?.discoverMarkets === true && result.summary.sampleMatch) {
        try {
          marketDiscovery = await this.dotaMarkets.discoverForFacts(result.summary.sampleMatch);
          result = this.service.normalizeGame(game, { forceFixture });
          result = {
            ...result,
            summary: annotateBoardMarketDiscovery(result.summary, marketDiscovery),
          };
        } catch {
          // Public discovery is best effort. Keep the normalized source facts and practice market.
        }
      }
      if (game === 'cs2' && req.body?.discoverMarkets === true && result.summary.sampleMatch) {
        try {
          marketDiscovery = await this.cs2Markets.discoverForFacts(result.summary.sampleMatch);
          result = this.service.normalizeGame(game, { forceFixture });
          result = {
            ...result,
            summary: annotateBoardMarketDiscovery(result.summary, marketDiscovery),
          };
        } catch {
          // Public discovery is best effort. Keep the normalized source facts and practice market.
        }
      }
      if (game === 'lol' && req.body?.discoverMarkets === true && result.summary.sampleMatch) {
        try {
          marketDiscovery = await this.lolMarkets.discoverForCandidates(
            result.persisted.length > 0 ? result.persisted : [result.summary.sampleMatch],
          );
          result = this.service.normalizeGame(game, {
            forceFixture,
            preferredExternalMatchId: marketDiscovery.matchedExternalMatchId,
          });
          result = {
            ...result,
            summary: annotateBoardMarketDiscovery(result.summary, marketDiscovery),
          };
        } catch {
          // Public discovery is best effort.
        }
      }
      if (game === 'valorant' && req.body?.discoverMarkets === true && result.summary.sampleMatch) {
        try {
          marketDiscovery = await this.valorantMarkets.discoverForCandidates(
            result.persisted.length > 0 ? result.persisted : [result.summary.sampleMatch],
          );
          result = this.service.normalizeGame(game, {
            forceFixture,
            preferredExternalMatchId: marketDiscovery.matchedExternalMatchId,
          });
          result = {
            ...result,
            summary: annotateBoardMarketDiscovery(result.summary, marketDiscovery),
          };
        } catch {
          // Public discovery is best effort.
        }
      }
      res.status(201).json({ data: { ...result, marketDiscovery, sourceRefresh } });
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
